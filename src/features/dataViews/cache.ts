/**
 * A short-lived, per-isolate cache of resolved views, in the same shape as the other caches in this
 * project (see features/roles/customRoleCache.ts and features/redirects/resolve.ts): a module-level
 * map, a TTL that bounds how long another isolate can serve an old copy, and an invalidate function
 * the write path calls.
 *
 * Invalidation is by generation number rather than by deleting entries: saving a document in a
 * collection bumps that collection's generation, so every cached view built from it is stale on its
 * next read. Saving a view, or an Extra fields set, bumps the global generation and so drops them all.
 * No import here, so the engine's write path can call it without pulling the feature in.
 */

export const DATA_VIEW_TTL_MS = 60_000
const MAX_ENTRIES = 200

type Entry = { at: number; global: number; collection: number; value: unknown }

const entries = new Map<string, Entry>()
const generations = new Map<string, number>()
let globalGeneration = 0

/** Collections whose documents never feed a view; saving them changes nothing cached here. */
const IRRELEVANT = new Set(['audit-log', 'email-log', 'preferences', 'locked-documents', 'form-submissions', 'event-rsvps', 'users', 'carts', 'orders', 'transactions', 'addresses', 'media'])

/** Called by the write path after any document is created, changed or deleted. */
export function noteDocumentChanged(slug: string): void {
  if (slug === 'data-views' || slug === 'field-groups') {
    globalGeneration += 1
    return
  }
  if (IRRELEVANT.has(slug)) return
  generations.set(slug, (generations.get(slug) ?? 0) + 1)
}

/** Forgets every cached view. */
export function invalidateDataViewCache(): void {
  globalGeneration += 1
  entries.clear()
}

/** `collection` is the source collection of a custom-fields view, or null for typed-in and imported data. */
export function readCachedView<T>(key: string, collection: string | null, now: number = Date.now()): T | undefined {
  const entry = entries.get(key)
  if (!entry) return undefined
  const fresh = now - entry.at < DATA_VIEW_TTL_MS && entry.global === globalGeneration && entry.collection === (collection ? (generations.get(collection) ?? 0) : 0)
  if (!fresh) {
    entries.delete(key)
    return undefined
  }
  return entry.value as T
}

export function writeCachedView(key: string, collection: string | null, value: unknown, now: number = Date.now()): void {
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest !== undefined) entries.delete(oldest)
  }
  entries.set(key, { at: now, global: globalGeneration, collection: collection ? (generations.get(collection) ?? 0) : 0, value })
}
