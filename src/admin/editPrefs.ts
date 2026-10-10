/**
 * Per-user memory of which edit-screen option cards are collapsed.
 *
 * Stored in the shared `preferences` collection under one fixed key, with the
 * value `{ closed: string[] }` listing the card ids that the user has folded
 * away. Ids are opaque strings chosen by the components (for example
 * `settings`, `panel:publish`, `outline:0.1`); anything that does not match
 * ID_PATTERN is dropped on the way in and on the way out.
 *
 * Mirrors src/admin/list/listPrefs.ts for owner handling: the polymorphic
 * `user` field cannot be queried, so rows are looked up by key and filtered to
 * the current user in code. All operations use `overrideAccess: true` because
 * the admin is a trusted caller managing its own preferences.
 */

import type { Engine, TypedUser } from '@/engine'

export const EDIT_PREFS_KEY = 'edit-screen-collapse'

export const MAX_CLOSED_IDS = 100

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,60}$/

export type EditPrefs = {
  closed: string[]
}

/**
 * Sanitize unknown input into a valid EditPrefs object.
 * Keeps at most MAX_CLOSED_IDS entries from the first slice of the input,
 * drops duplicates and anything not matching ID_PATTERN, and drops other fields.
 */
export function sanitizeEditPrefs(input: unknown): EditPrefs {
  if (typeof input !== 'object' || input === null) return { closed: [] }
  const raw = (input as { closed?: unknown }).closed
  if (!Array.isArray(raw)) return { closed: [] }

  const seen = new Set<string>()
  for (const id of raw.slice(0, MAX_CLOSED_IDS)) {
    if (typeof id === 'string' && ID_PATTERN.test(id)) seen.add(id)
  }
  return { closed: [...seen] }
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
 * Load the collapsed-card state for a user.
 * Returns `{ closed: [] }` when there is no user, no row, or on any error.
 */
export async function loadEditPrefs(engine: Engine, user: TypedUser | null): Promise<EditPrefs> {
  if (!user) return { closed: [] }

  try {
    const docs = await engine.find({
      collection: 'preferences',
      where: ownerWhere(EDIT_PREFS_KEY, user),
      depth: 0,
      limit: 1000,
      pagination: false,
      user,
      overrideAccess: true,
    })

    const mine = (docs.docs ?? []).filter((d) => belongsTo(d, user))
    if (mine.length > 0) {
      const value = (mine[0] as { value?: unknown }).value
      return sanitizeEditPrefs(value)
    }
  } catch {
    // Silently fall back to empty prefs on any error
  }

  return { closed: [] }
}

/**
 * Save the collapsed-card state for a user. `closed` is the full list, so the
 * stored value is replaced rather than appended to.
 */
export async function saveEditPrefs(engine: Engine, user: TypedUser | null, input: unknown): Promise<EditPrefs> {
  if (!user) return { closed: [] }

  const sanitized = sanitizeEditPrefs(input)

  const docs = await engine.find({
    collection: 'preferences',
    where: ownerWhere(EDIT_PREFS_KEY, user),
    depth: 0,
    limit: 1000,
    pagination: false,
    user,
    overrideAccess: true,
  })

  const mine = (docs.docs ?? []).filter((d) => belongsTo(d, user))
  if (mine.length > 0) {
    const doc = mine[0]
    await engine.update({
      collection: 'preferences',
      id: (doc as { id?: unknown }).id as number,
      data: { value: sanitized },
      user,
      overrideAccess: true,
    })
  } else {
    await engine.create({
      collection: 'preferences',
      data: {
        key: EDIT_PREFS_KEY,
        user: [user.id],
        value: sanitized,
      } as never,
      user,
      overrideAccess: true,
    })
  }

  return sanitized
}
