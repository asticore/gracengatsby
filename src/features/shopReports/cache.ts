/**
 * A small in-memory cache for report results: five minutes per key. It lives in one Worker
 * instance, so each instance keeps its own copy; that is fine for a report that is looked at now and then.
 */

export const REPORT_CACHE_MS = 5 * 60_000
const MAX_ENTRIES = 50

const store = new Map<string, { at: number; value: unknown }>()

export async function cachedReport<T>(key: string, load: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = store.get(key)
  if (hit && now() - hit.at < REPORT_CACHE_MS) return hit.value as T
  const value = await load()
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string)
  store.set(key, { at: now(), value })
  return value
}

/** Used by tests, and after a settings change that should show at once. */
export function clearReportCache(): void {
  store.clear()
}
