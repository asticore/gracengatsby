export type SocialTestResult = { ok?: unknown; count?: unknown; error?: unknown } | null | undefined

/** Plain message for the Test connection button. The server already redacts tokens from `error`. */
export function socialTestMessage(result: SocialTestResult): { ok: boolean; text: string } {
  if (result && result.ok === true) {
    const n = typeof result.count === 'number' ? result.count : 0
    return { ok: true, text: `Connected. Found ${n} ${n === 1 ? 'post' : 'posts'}.` }
  }
  const err = result && typeof result.error === 'string' && result.error.trim() ? result.error.trim().slice(0, 300) : 'Test failed.'
  return { ok: false, text: err }
}

/** Row ids are numeric or string; anything else means the row is not saved yet. */
export function socialRowId(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}
