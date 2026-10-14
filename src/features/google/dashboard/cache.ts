/**
 * Five-minute in-memory cache for each widget's successful result. Keyed by widget and the account
 * ids it reads, so changing the chosen property or site loads fresh numbers at once.
 * Only successful results are cached; errors and "not connected" are not, so a fix shows up on the next load.
 */

export const WIDGET_CACHE_MS = 5 * 60 * 1000

type Entry = { expires: number; value: unknown }

const store = new Map<string, Entry>()

/** Returns the cached value for `key`, or runs `load` and caches the result when `cacheable` says so. */
export async function cached<T>(key: string, load: () => Promise<T>, cacheable: (value: T) => boolean, now: () => number = Date.now): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expires > now()) return hit.value as T
  const value = await load()
  if (cacheable(value)) store.set(key, { expires: now() + WIDGET_CACHE_MS, value })
  return value
}

/** Used by tests. */
export function clearWidgetCache(): void {
  store.clear()
}
