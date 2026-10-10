/**
 * The one way the media admin screens talk to the media routes. Returns the
 * body on success and a readable message on failure, so every caller handles
 * errors the same way.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...init })
    const body = (await response.json().catch((): null => null)) as (T & { error?: string }) | null
    if (!response.ok || !body) {
      return { ok: false, error: body?.error ?? `The request failed (${response.status}).` }
    }
    return { ok: true, data: body }
  } catch {
    return { ok: false, error: 'The request could not be sent. Check your connection and try again.' }
  }
}

export function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Human-readable byte count, shared by the edit panel and the gallery. */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "2.1 MB -> 540 KB (74% smaller)" - the before and after line shown after an optimisation. */
export function describeSaving(before: number | null, after: number | null): string {
  if (!before || !after) return ''
  const saved = Math.round((1 - after / before) * 100)
  const direction = saved >= 0 ? `${saved}% smaller` : `${Math.abs(saved)}% larger`
  return `${formatBytes(before)} to ${formatBytes(after)} (${direction})`
}
