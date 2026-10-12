import type { FormDoc, FormWebhook, SubmissionValues } from './types'

/**
 * Webhooks: tell another system when a form is submitted.
 *
 * Each delivery is a JSON POST signed with HMAC-SHA256 so the receiver can
 * prove it came from here and was not altered: the signature header is
 *
 *   X-Form-Signature: t=<unix seconds>,v1=<hex hmac of "<t>.<raw body>">
 *
 * The timestamp is inside the signed text so a captured request cannot be
 * replayed later (the receiver rejects an old `t`). The secret is per webhook
 * and never leaves the server.
 *
 * Failure handling: one attempt is made immediately; a failure is logged on
 * the entry and retried by the cron sweep with a growing delay, up to
 * `MAX_ATTEMPTS`, after which the entry is marked failed and shows in the log
 * for a manual retry. A webhook can never fail the visitor's submission.
 */

export const MAX_ATTEMPTS = 5
/** Delay before attempt 2, 3, 4, 5 - in minutes. */
const BACKOFF_MINUTES = [5, 30, 120, 720]
const TIMEOUT_MS = 6000

export type WebhookAttempt = {
  webhookId: string
  name: string
  /** Host only: the full URL may carry a token in its path or query. */
  host: string
  attempt: number
  at: string
  ok: boolean
  status?: number
  error?: string
}

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  return hex(signature)
}

/** Constant-time check of a signature header, for a receiver (and the tests). Rejects timestamps older than `toleranceSeconds`. */
export async function verifySignature(
  secret: string,
  header: string,
  body: string,
  now = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header.trim())
  if (!match) return false
  const timestamp = Number(match[1])
  if (Math.abs(now - timestamp) > toleranceSeconds) return false
  const expected = await signPayload(secret, timestamp, body)
  if (expected.length !== match[2].length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ match[2].charCodeAt(i)
  return diff === 0
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

/**
 * Only public https URLs. A webhook URL is typed by an editor and then fetched
 * from the server, so it must not be able to aim at the machine's own network
 * (SSRF): no http, no credentials, no IP literals in private ranges, no
 * internal-looking names. Cloudflare Workers cannot reach private ranges
 * anyway; this is defence in depth and a clear message at save time.
 */
export function isSafeWebhookUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  if (!host || PRIVATE_HOST.test(host) || /\.(local|internal)$/.test(host)) return false
  if (/^\[/.test(host) || host.includes(':')) return false
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
    const c = Number(ipv4[3])
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 192 && b === 0 && c === 0) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    if (a >= 224) return false
  }
  return true
}

export type WebhookPayload = {
  event: 'form.submitted'
  deliveryId: string
  form: { id: number | string; title: string }
  submission: { id?: number | string; submittedAt: string; values: SubmissionValues; labels: Record<string, string> }
}

export function buildPayload(
  form: Pick<FormDoc, 'id' | 'title'>,
  fields: { name?: string; label?: string }[],
  submissionId: number | string | undefined,
  values: SubmissionValues,
  submittedAt: string,
  deliveryId: string,
): WebhookPayload {
  const labels: Record<string, string> = {}
  for (const field of fields) if (field.name) labels[field.name] = field.label || field.name
  return {
    event: 'form.submitted',
    deliveryId,
    form: { id: form.id as number | string, title: form.title || '' },
    submission: { id: submissionId, submittedAt, values, labels },
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** One delivery attempt. Never throws. */
export async function deliver(
  hook: FormWebhook,
  payload: WebhookPayload,
  attempt: number,
  fetcher: typeof fetch = fetch,
  now: () => number = () => Date.now(),
): Promise<WebhookAttempt> {
  const base: WebhookAttempt = {
    webhookId: hook.id || '',
    name: hook.name || 'Webhook',
    host: hostOf(hook.url || ''),
    attempt,
    at: new Date(now()).toISOString(),
    ok: false,
  }
  if (!hook.url || !isSafeWebhookUrl(hook.url)) return { ...base, error: 'The URL is not a public https address.' }

  const body = JSON.stringify(payload)
  const timestamp = Math.floor(now() / 1000)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Form-Webhook/1',
    'X-Form-Event': payload.event,
    'X-Form-Delivery': payload.deliveryId,
  }
  if (hook.secret) headers['X-Form-Signature'] = `t=${timestamp},v1=${await signPayload(hook.secret, timestamp, body)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetcher(hook.url, { method: 'POST', headers, body, signal: controller.signal, redirect: 'manual' })
    // A redirect is not followed: it could send the signed body somewhere the author did not name.
    const ok = response.status >= 200 && response.status < 300
    return { ...base, ok, status: response.status, ...(ok ? {} : { error: `The receiver answered ${response.status}.` }) }
  } catch (error) {
    return { ...base, error: error instanceof Error && error.name === 'AbortError' ? 'Timed out.' : 'Could not connect.' }
  } finally {
    clearTimeout(timer)
  }
}

/** When to try again after `attempt` failed, or null when the attempts are used up. */
export function nextAttemptAt(attempt: number, from = Date.now()): string | null {
  if (attempt >= MAX_ATTEMPTS) return null
  const minutes = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)]
  return new Date(from + minutes * 60_000).toISOString()
}

export type WebhookState = 'none' | 'ok' | 'retry' | 'failed'

/**
 * The state of an entry's webhooks from its attempt log: ok when the latest
 * attempt for every webhook succeeded, retry while any has attempts left,
 * failed once all attempts are used.
 */
export function summariseAttempts(attempts: WebhookAttempt[]): { state: WebhookState; retryAt: string | null } {
  if (attempts.length === 0) return { state: 'none', retryAt: null }
  const latest = new Map<string, WebhookAttempt>()
  for (const entry of attempts) {
    const seen = latest.get(entry.webhookId)
    if (!seen || entry.attempt >= seen.attempt) latest.set(entry.webhookId, entry)
  }
  const failing = Array.from(latest.values()).filter((entry) => !entry.ok)
  if (failing.length === 0) return { state: 'ok', retryAt: null }
  const retryable = failing.filter((entry) => entry.attempt < MAX_ATTEMPTS)
  if (retryable.length === 0) return { state: 'failed', retryAt: null }
  const earliest = Math.min(...retryable.map((entry) => new Date(nextAttemptAt(entry.attempt, new Date(entry.at).getTime()) as string).getTime()))
  return { state: 'retry', retryAt: new Date(earliest).toISOString() }
}
