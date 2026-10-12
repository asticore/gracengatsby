/**
 * The one place carrier adapters make network calls. Tests swap `http.fetch`; production uses the
 * runtime fetch with a hard timeout so a slow carrier can never hang checkout.
 */
export const http: { fetch: (url: string, init?: RequestInit) => Promise<Response> } = {
  fetch: (url, init) => fetch(url, init),
}

export const DEFAULT_TIMEOUT_MS = 6000

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ status: number; ok: boolean; body: T | null; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await http.fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let body: T | null = null
    try {
      body = text ? (JSON.parse(text) as T) : null
    } catch {
      body = null
    }
    return { status: res.status, ok: res.ok, body, text }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The carrier took too long to answer.')
    throw new Error(error instanceof Error ? error.message : 'Could not reach the carrier.')
  } finally {
    clearTimeout(timer)
  }
}

export const basicAuth = (user: string, pass: string): string => `Basic ${btoa(`${user}:${pass}`)}`
