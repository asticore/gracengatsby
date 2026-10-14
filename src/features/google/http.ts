import { GOOGLE_TIMEOUT_MS } from './constants'

/**
 * One JSON request with the Google timeout. The body is read inside the same
 * window, so a slow body counts against the 10 seconds too. Throws on a network
 * failure or a timeout; a non-2xx answer comes back as ok: false.
 */
export type JsonResult = { ok: boolean; status: number; body: unknown }

export async function requestJson(url: string, init: RequestInit = {}): Promise<JsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body: unknown = await response.json().catch((): null => null)
    return { ok: response.ok, status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}
