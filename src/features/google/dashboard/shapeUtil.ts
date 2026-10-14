/**
 * Small safe readers for Google's JSON. Google's numbers arrive as numbers or strings, and missing
 * fields are normal (no data yet), so every reader falls back to zero or null instead of throwing.
 */

export const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Maps a thrown error to a plain message for the card. Never includes tokens or request bodies. */
export function errorMessage(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return `Google refused the request (${status}). Check the Google connection and that the API is switched on in Google Cloud.`
    if (status === 429) return 'Google is limiting requests right now. Try again in a few minutes.'
    return `Google returned an error (${status}). Try again later.`
  }
  return 'Could not reach Google. Try again in a minute.'
}
