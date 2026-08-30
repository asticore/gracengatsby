/**
 * Tables the cleanup tool must never drop, whatever the feature map says.
 *
 * Two kinds live here, for two different reasons:
 *
 *   - Shared content. `eg_pages`, `eg_media` and `eg_users` are used by every
 *     feature and belong to none, so no feature is ever entitled to take them
 *     with it. They are listed as PARENTS, not as flat names, because their
 *     children (`eg_pages_blocks_hero`, `_eg_pages_v_rels`, `eg_users_roles`)
 *     matter just as much and are discovered from the live schema.
 *
 *   - Engine bookkeeping. Migration history, preferences, document locks and
 *     the KV table are how the CMS engine knows what state it is in. Dropping
 *     any of them does not free meaningful space and does break the portal.
 *     Cloudflare's own `_cf_METADATA` is not ours to touch at all.
 *
 * This list is the last word: the planner filters against it after it has
 * worked out what a feature owns, so a mistake in the feature map cannot reach
 * a DROP statement.
 */

/** Shared content parents. Their whole discovered family is protected too. */
export const SHARED_PARENTS = ['eg_pages', 'eg_media', 'eg_users']

/** Bookkeeping tables, matched exactly. */
export const PROTECTED_EXACT = ['eg_migrations', 'eg_kv', '_cf_METADATA']

/**
 * Bookkeeping families, matched as `<prefix>` or `<prefix>_...`. Covers
 * `eg_preferences_rels` and `eg_locked_documents_rels` without naming them, so
 * a future child table is protected the day it appears rather than the day
 * someone remembers to add it.
 */
export const PROTECTED_PREFIXES = ['eg_preferences', 'eg_locked_documents']

/** True when a table is engine bookkeeping and therefore never droppable. */
export function isBookkeepingTable(table: string): boolean {
  if (PROTECTED_EXACT.includes(table)) return true
  if (table.startsWith('sqlite_')) return true
  return PROTECTED_PREFIXES.some((prefix) => table === prefix || table.startsWith(`${prefix}_`))
}
