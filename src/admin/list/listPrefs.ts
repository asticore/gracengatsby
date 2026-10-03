/**
 * Per-user saved list preferences for admin collection lists.
 *
 * Stores and retrieves user preferences (columns, sort, page size, view tab)
 * for each collection via the shared `preferences` collection with a scoped key.
 * All operations are user-scoped and use `overrideAccess: true` since the admin
 * is a trusted caller managing its own preferences.
 */

import type { Engine, TypedUser } from '@/engine'

export type ListPrefs = {
  cols?: string[]
  sort?: string
  limit?: number
  view?: string
}

/**
 * Sanitize unknown input into a valid ListPrefs object.
 * Accepts only:
 * - cols: array of up to 30 strings matching /^[A-Za-z0-9_.]+$/
 * - sort: string matching /^-?[A-Za-z0-9_.]+$/
 * - limit: one of 10, 25, 50, 100
 * - view: one of 'list', 'gallery', 'calendar', 'tree'
 * Drops everything else.
 */
export function sanitizeListPrefs(input: unknown): ListPrefs {
  if (typeof input !== 'object' || input === null) return {}

  const result: ListPrefs = {}
  const obj = input as Record<string, unknown>

  // Sanitize cols
  if (Array.isArray(obj.cols)) {
    const sanitized = obj.cols
      .slice(0, 30)
      .filter((col) => typeof col === 'string' && /^[A-Za-z0-9_.]+$/.test(col))
    if (sanitized.length > 0) result.cols = sanitized
  }

  // Sanitize sort
  if (typeof obj.sort === 'string' && /^-?[A-Za-z0-9_.]+$/.test(obj.sort)) {
    result.sort = obj.sort
  }

  // Sanitize limit
  if (typeof obj.limit === 'number' && [10, 25, 50, 100].includes(obj.limit)) {
    result.limit = obj.limit
  }

  // Sanitize view
  if (typeof obj.view === 'string' && ['list', 'gallery', 'calendar', 'tree'].includes(obj.view)) {
    result.view = obj.view
  }

  return result
}

/**
 * Generate the preferences key for a collection's list preferences.
 * Format: `collection-{slug}-list`
 */
export function prefsKey(collectionSlug: string): string {
  return `collection-${collectionSlug}-list`
}

/**
 * The preferences `user` field is polymorphic (`relationTo: ['users']`), and
 * the where-builder has no column for `user.relationTo` / `user.value`, so the
 * row cannot be matched in the query. Look up by key, then keep only the row
 * that belongs to this user.
 */
function ownerWhere(key: string, _user: TypedUser) {
  return { key: { equals: key } }
}

function belongsTo(doc: unknown, user: TypedUser): boolean {
  const owner = (doc as { user?: unknown }).user
  const first = Array.isArray(owner) ? owner[0] : owner
  if (first === null || first === undefined) return false
  const value =
    typeof first === 'object' ? (first as { value?: unknown; id?: unknown }).value ?? (first as { id?: unknown }).id : first
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  return String(id) === String(user.id)
}

/**
 * Load the list preferences for a user and collection.
 * Returns the sanitized preferences object or {} if not found or on any error.
 */
export async function loadListPrefs(
  engine: Engine,
  user: TypedUser | null,
  collectionSlug: string,
): Promise<ListPrefs> {
  if (!user) return {}

  try {
    const key = prefsKey(collectionSlug)
    const docs = await engine.find({
      collection: 'preferences',
      where: ownerWhere(key, user),
      depth: 0,
      limit: 1000,
      pagination: false,
      user,
      overrideAccess: true,
    })

    const mine = (docs.docs ?? []).filter((d) => belongsTo(d, user))
    if (mine.length > 0) {
      const doc = mine[0]
      const value = (doc as { value?: unknown }).value
      return sanitizeListPrefs(value)
    }
  } catch {
    // Silently fall back to empty prefs on any error
  }

  return {}
}

/**
 * Save list preferences for a user and collection.
 * Merges with existing preferences (only specified fields are updated).
 * The `value` field in the preferences collection stores the JSON.
 */
export async function saveListPrefs(
  engine: Engine,
  user: TypedUser | null,
  collectionSlug: string,
  prefs: unknown,
): Promise<ListPrefs> {
  if (!user) return {}

  const sanitized = sanitizeListPrefs(prefs)

  const key = prefsKey(collectionSlug)

  // Find existing doc
  const docs = await engine.find({
    collection: 'preferences',
    where: ownerWhere(key, user),
    depth: 0,
    limit: 1000,
    pagination: false,
    user,
    overrideAccess: true,
  })

  const mine = (docs.docs ?? []).filter((d) => belongsTo(d, user))
  if (mine.length > 0) {
    // Update existing doc - merge with existing value
    const doc = mine[0]
    const existing = sanitizeListPrefs((doc as { value?: unknown }).value)
    const merged = { ...existing, ...sanitized }

    await engine.update({
      collection: 'preferences',
      id: (doc as { id?: unknown }).id as number,
      data: { value: merged },
      user,
      overrideAccess: true,
    })

    return merged
  } else {
    // Create new doc
    await engine.create({
      collection: 'preferences',
      data: {
        key,
        user: [user.id],
        value: sanitized,
      } as never,
      user,
      overrideAccess: true,
    })

    return sanitized
  }
}

/**
 * Delete the list preferences for a user and collection.
 */
export async function resetListPrefs(
  engine: Engine,
  user: TypedUser | null,
  collectionSlug: string,
): Promise<void> {
  if (!user) return

  try {
    const key = prefsKey(collectionSlug)
    const docs = await engine.find({
      collection: 'preferences',
      where: ownerWhere(key, user),
      depth: 0,
      limit: 1000,
      pagination: false,
      user,
      overrideAccess: true,
    })

    const mine = (docs.docs ?? []).filter((d) => belongsTo(d, user))
    if (mine.length > 0) {
      const doc = mine[0]
      await engine.delete({
        collection: 'preferences',
        id: (doc as { id?: unknown }).id as number,
        user,
        overrideAccess: true,
      })
    }
  } catch {
    // Silently ignore errors on delete
  }
}
