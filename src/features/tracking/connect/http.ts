import { CONNECT_TIMEOUT_MS } from './constants'

/**
 * The one HTTP seam for the ad-platform clients. Tests pass a fake `fetch`;
 * production passes the global one. Every call has a timeout.
 */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export type JsonOutcome = { ok: boolean; status: number; body: Record<string, unknown> }

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** A JSON request with the connection timeout. Throws on a network failure or a timeout. */
export async function requestJson(fetchImpl: Fetcher, url: string, init: RequestInit = {}): Promise<JsonOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const body = asRecord(await response.json().catch((): null => null))
    return { ok: response.ok, status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}
