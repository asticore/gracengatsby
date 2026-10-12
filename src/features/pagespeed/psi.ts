import { parsePsiResponse } from './parse'
import type { PageSpeedReport, Strategy } from './types'

/**
 * Calls the Google PageSpeed Insights v5 API. The endpoint is a fixed constant and the only
 * variable inputs are the target URL (built server-side, see target.ts), the strategy (validated to
 * two values) and the key.
 */

export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
export const PSI_TIMEOUT_MS = 60_000
/** A full Lighthouse report is typically 0.5-2 MB. Anything past this is refused unread. */
export const PSI_MAX_BYTES = 6 * 1024 * 1024
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

export type PsiOutcome =
  | { ok: true; report: PageSpeedReport }
  | { ok: false; code: 'rate-limited' | 'timeout' | 'bad-key' | 'unreachable' | 'too-large' | 'failed'; message: string }

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>

export function buildPsiUrl(target: string, strategy: Strategy, apiKey?: string | null): string {
  const params = new URLSearchParams()
  params.set('url', target)
  params.set('strategy', strategy)
  for (const category of CATEGORIES) params.append('category', category)
  if (apiKey) params.set('key', apiKey)
  return `${PSI_ENDPOINT}?${params.toString()}`
}

const RATE_LIMIT_MESSAGE_KEY =
  'Google is limiting how many tests can run right now. Wait a minute and try again. Adding a free PageSpeed API key in Integrations raises the limit a lot.'
const RATE_LIMIT_MESSAGE_NOKEY =
  'Google is limiting how many tests can run right now. Wait a minute and try again, or add a free PageSpeed API key under Integrations > Google to raise the limit.'

/** Reads at most `max` bytes of the body as text; returns null when the body is larger. */
async function readCapped(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!response.body) {
    const text = await response.text()
    return text.length > max ? null : text
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > max) {
      await reader.cancel().catch((): void => undefined)
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export async function runPageSpeed(opts: {
  url: string
  strategy: Strategy
  apiKey?: string | null
  fetchImpl?: FetchLike
  timeoutMs?: number
  maxBytes?: number
}): Promise<PsiOutcome> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init): Promise<Response> => fetch(input, init))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PSI_TIMEOUT_MS)
  try {
    const response = await fetchImpl(buildPsiUrl(opts.url, opts.strategy, opts.apiKey), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (response.status === 429) {
      return { ok: false, code: 'rate-limited', message: opts.apiKey ? RATE_LIMIT_MESSAGE_KEY : RATE_LIMIT_MESSAGE_NOKEY }
    }
    if (!response.ok) {
      const body = await readCapped(response, 64 * 1024).catch((): null => null)
      let reason = ''
      let status = ''
      try {
        const error = (JSON.parse(body ?? '{}') as { error?: { message?: unknown; status?: unknown; errors?: { reason?: unknown }[] } }).error
        reason = String(error?.errors?.[0]?.reason ?? '')
        status = String(error?.status ?? '')
        if (response.status === 403 && /quota|rate|limit/i.test(`${reason} ${status} ${String(error?.message ?? '')}`)) {
          return { ok: false, code: 'rate-limited', message: opts.apiKey ? RATE_LIMIT_MESSAGE_KEY : RATE_LIMIT_MESSAGE_NOKEY }
        }
        if (response.status === 400 && /key/i.test(String(error?.message ?? ''))) {
          return { ok: false, code: 'bad-key', message: 'Google rejected the PageSpeed API key. Check it under Integrations > Google, and that the PageSpeed Insights API is enabled for it.' }
        }
        if (response.status === 403) {
          return { ok: false, code: 'bad-key', message: 'Google refused the request. If you added a PageSpeed API key, check that the PageSpeed Insights API is enabled for it.' }
        }
        if (response.status === 500 || response.status === 400) {
          return { ok: false, code: 'unreachable', message: 'Google could not load the page. Check that it is live and not password protected, then try again.' }
        }
      } catch {
        // Not JSON: fall through to the generic message.
      }
      return { ok: false, code: 'failed', message: `Google returned an error (${response.status}). Try again in a minute.` }
    }
    const text = await readCapped(response, opts.maxBytes ?? PSI_MAX_BYTES)
    if (text === null) return { ok: false, code: 'too-large', message: 'Google sent back an unexpectedly large response, so it was discarded.' }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, code: 'failed', message: 'Google sent back something that was not a test result. Try again.' }
    }
    const report = parsePsiResponse(json)
    if (!report) return { ok: false, code: 'failed', message: 'Google could not score this page. Check it loads in a browser, then try again.' }
    return { ok: true, report }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, code: 'timeout', message: 'The test took longer than 60 seconds, so it was stopped. Try again; busy times can be slow.' }
    }
    return { ok: false, code: 'failed', message: error instanceof Error && error.message ? 'Could not reach Google. Try again in a minute.' : 'Could not reach Google.' }
  } finally {
    clearTimeout(timer)
  }
}
