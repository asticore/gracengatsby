import { isWebhookEvent, type WebhookEvent } from './events'

/**
 * Webhooks builder: the pure rules. No database, no request, no engine, so each rule can be tested
 * on its own. Storage is in ./store.ts, delivery in ./delivery.ts, the admin in ./actions.ts.
 *
 * A webhook sends a signed JSON POST to an address an admin typed in, so the address is untrusted
 * input for the server's own network. `checkWebhookUrl` keeps it to public https addresses. It can
 * only see the address as written: a public host name that resolves to a private address cannot be
 * caught here (Workers do not expose the resolved address). The redirect ban and the port rule are
 * the other two guards; see the caveats in the PR.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const MAX_WEBHOOKS = 20
export const MAX_NAME = 80
export const MAX_DESCRIPTION = 300
export const MAX_URL = 500
export const MAX_TEMPLATE_CHARS = 4096
/** The largest body sent. A bigger payload is not sent; the delivery is recorded as skipped. */
export const MAX_PAYLOAD_BYTES = 65_536
export const DEFAULT_RATE_PER_MINUTE = 60
export const MAX_RATE_PER_MINUTE = 600
/** Total attempts for one delivery, the first included. */
export const MAX_ATTEMPTS = 6
/** Wait after attempt 1, 2, 3, 4 and 5 before the next try: 1 minute, 5, 30, 2 hours, 6 hours. */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21600] as const
export const REQUEST_TIMEOUT_MS = 8000
/** Delivery rows older than this are removed by the cron job. */
export const DELIVERY_RETENTION_DAYS = 30
export const SIGNATURE_HEADER = 'X-Engage-Signature'
export const SIGNATURE_TOLERANCE_SECONDS = 300

export type DeliveryStatus = 'pending' | 'ok' | 'failed' | 'skipped'

export type WebhookConfig = {
  name: string
  description: string
  url: string
  events: WebhookEvent[]
  /** A JSON template with {{merge.tags}}, or null for the standard payload. */
  template: string | null
  enabled: boolean
  ratePerMinute: number
}

/* ------------------------------------------------------------------ URLs */

const BLOCKED_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa', 'corp', 'intranet', 'private']
const BLOCKED_NAMES = new Set(['metadata', 'metadata.goog', 'instance-data'])

/** True for IPv4 addresses that are not on the public internet (loopback, private, link-local, metadata, multicast, reserved). */
export function isBlockedIPv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

/**
 * Checks a webhook address as typed. Only https, on the default port, to a host name with a dot that
 * is not a private or internal name, with no credentials. An IPv6 literal is refused outright, and so
 * is any IPv4 literal that falls in a blocked range.
 */
export function checkWebhookUrl(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false, error: 'Enter the address that should receive the webhook.' }
  const text = value.trim()
  if (text.length > MAX_URL) return { ok: false, error: `The address can be at most ${MAX_URL} characters.` }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: 'The address is not a valid web address.' }
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The address must start with https://.' }
  if (url.username || url.password) return { ok: false, error: 'The address must not contain a user name or password.' }
  if (url.port !== '') return { ok: false, error: 'Use the standard https port (443). Other ports are not allowed.' }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  if (!host) return { ok: false, error: 'The address needs a host name.' }
  if (host.startsWith('[') || host.includes(':')) return { ok: false, error: 'IPv6 addresses are not allowed. Use a host name.' }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const [a, b, c, d] = [Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4])]
    if ([a, b, c, d].some((n) => n > 255)) return { ok: false, error: 'The address is not a valid IP address.' }
    if (isBlockedIPv4(a, b, c)) return { ok: false, error: 'That address is on a private or internal network. Use a public address.' }
    return { ok: true, value: url.href }
  }
  if (!host.includes('.')) return { ok: false, error: 'Use a full public host name, such as hooks.example.com.' }
  const labels = host.split('.')
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, error: 'The address is not a valid host name.' }
  if (BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return { ok: false, error: 'That host name is internal. Use a public address.' }
  }
  return { ok: true, value: url.href }
}

/* ------------------------------------------------------------- templates */

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,4})\s*\}\}/g
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Merge tags a template can use. `data.<field>` takes any field the event sends. */
export const MERGE_TAGS = ['event', 'id', 'occurredAt', 'data.<field>'] as const

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Checks a template: valid JSON once its tags are filled, a size cap, and a shape cap. Empty means the standard payload. */
export function validateTemplate(value: unknown): ValidationResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'The payload template must be text.' }
  if (value.trim() === '') return { ok: true, value: null }
  if (value.length > MAX_TEMPLATE_CHARS) return { ok: false, error: `The payload template can be at most ${MAX_TEMPLATE_CHARS} characters.` }
  // A tag inside a JSON string becomes plain text; a bare tag (outside quotes) leaves invalid JSON behind.
  const probe = value.replace(PLACEHOLDER, 'x')
  let parsed: Json
  try {
    parsed = JSON.parse(probe) as Json
  } catch {
    return { ok: false, error: 'The payload template must be valid JSON. Put merge tags inside quotes, such as "title": "{{data.title}}".' }
  }
  const shape = checkShape(parsed, 0)
  if (shape) return { ok: false, error: shape }
  return { ok: true, value }
}

function checkShape(value: Json, depth: number): string | null {
  if (depth > 6) return 'The payload template is nested too deeply (6 levels at most).'
  if (Array.isArray(value)) {
    if (value.length > 50) return 'A list in the payload template can hold 50 items at most.'
    for (const item of value) {
      const problem = checkShape(item, depth + 1)
      if (problem) return problem
    }
    return null
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length > 100) return 'An object in the payload template can hold 100 keys at most.'
    for (const key of keys) {
      const problem = checkShape((value as Record<string, Json>)[key], depth + 1)
      if (problem) return problem
    }
  }
  return null
}

function lookup(context: Record<string, unknown>, path: string): unknown {
  let current: unknown = context
  for (const part of path.split('.')) {
    if (UNSAFE_KEYS.has(part) || current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function fill(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}$/.exec(value)
    if (exact) {
      const found = lookup(context, exact[1])
      return found === undefined ? null : found
    }
    return value.replace(PLACEHOLDER, (_all, path: string) => asText(lookup(context, path)))
  }
  if (Array.isArray(value)) return value.map((item) => fill(item, context))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = fill(item, context)
    return out
  }
  return value
}

/**
 * Builds the body for one delivery. With no template the body is the standard payload:
 * { event, id, occurredAt, data }. With a template, its tags are filled from the same context.
 * Returns an error when the body is over the size cap.
 */
export function renderBody(template: string | null, context: { event: string; id: string; occurredAt: string; data: Record<string, unknown> }): ValidationResult<string> {
  let body: string
  if (template === null) {
    body = JSON.stringify(context)
  } else {
    let parsed: Json
    try {
      parsed = JSON.parse(template) as Json
    } catch {
      return { ok: false, error: 'The payload template is not valid JSON.' }
    }
    body = JSON.stringify(fill(parsed, context as unknown as Record<string, unknown>))
  }
  if (new TextEncoder().encode(body).length > MAX_PAYLOAD_BYTES) return { ok: false, error: 'The payload is larger than the limit and was not sent.' }
  return { ok: true, value: body }
}

/* ------------------------------------------------------------- signing */

const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** HMAC-SHA256 over "<unix seconds>.<raw body>", hex. The timestamp is inside the signed text, so an old request cannot be replayed. */
export async function signBody(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)))
}

/** The header value: t=<unix seconds>,v1=<hex>. */
export async function signatureHeader(secret: string, timestamp: number, body: string): Promise<string> {
  return `t=${timestamp},v1=${await signBody(secret, timestamp, body)}`
}

/** For a receiver (and the tests): constant-time check, refusing a timestamp outside the tolerance. */
export async function verifySignature(secret: string, header: string, body: string, now = Math.floor(Date.now() / 1000), tolerance = SIGNATURE_TOLERANCE_SECONDS): Promise<boolean> {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header.trim())
  if (!match) return false
  const timestamp = Number(match[1])
  if (Math.abs(now - timestamp) > tolerance) return false
  const expected = await signBody(secret, timestamp, body)
  if (expected.length !== match[2].length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ match[2].charCodeAt(i)
  return diff === 0
}

/** A new signing secret: "whsec_" and 32 random bytes in hex. Shown once, then only the encrypted copy is kept. */
export function newSigningSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `whsec_${hex(bytes.buffer)}`
}

/* -------------------------------------------------------------- retries */

/** When to try again after `attemptsDone` tries have failed, or null when no tries are left. */
export function nextAttemptAt(attemptsDone: number, nowMs: number): string | null {
  if (attemptsDone >= MAX_ATTEMPTS) return null
  const index = Math.min(Math.max(attemptsDone, 1) - 1, RETRY_DELAYS_SECONDS.length - 1)
  return new Date(nowMs + RETRY_DELAYS_SECONDS[index] * 1000).toISOString()
}

/** Whether a webhook has used its share for the last minute. */
export const isOverRate = (sentInLastMinute: number, ratePerMinute: number): boolean => sentInLastMinute >= ratePerMinute

/* ------------------------------------------------------------ validation */

const str = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null)

/** Checks an admin's form input for one webhook. The signing secret is not part of it. */
export function validateWebhook(input: unknown): ValidationResult<WebhookConfig> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'The webhook is missing its details.' }
  const raw = input as Record<string, unknown>

  const name = str(raw.name, MAX_NAME)
  if (!name) return { ok: false, error: `Give the webhook a name of ${MAX_NAME} characters or fewer.` }
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, MAX_DESCRIPTION) : ''

  const url = checkWebhookUrl(raw.url)
  if (url.ok === false) return url

  if (!Array.isArray(raw.events) || raw.events.length === 0) return { ok: false, error: 'Choose at least one event.' }
  const events: WebhookEvent[] = []
  for (const item of raw.events) {
    if (!isWebhookEvent(item)) return { ok: false, error: `"${String(item)}" is not an event this site sends.` }
    if (!events.includes(item)) events.push(item)
  }

  const template = validateTemplate(raw.template)
  if (template.ok === false) return template

  let ratePerMinute = DEFAULT_RATE_PER_MINUTE
  if (raw.ratePerMinute !== undefined && raw.ratePerMinute !== null && raw.ratePerMinute !== '') {
    const n = Number(raw.ratePerMinute)
    if (!Number.isInteger(n) || n < 1 || n > MAX_RATE_PER_MINUTE) return { ok: false, error: `The rate limit must be between 1 and ${MAX_RATE_PER_MINUTE} deliveries a minute.` }
    ratePerMinute = n
  }

  return {
    ok: true,
    value: { name, description, url: url.value, events, template: template.value, enabled: raw.enabled !== false, ratePerMinute },
  }
}
