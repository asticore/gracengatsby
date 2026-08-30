/**
 * Works out which physical tables each feature owns.
 *
 * The feature map (features/registry.ts) names BASE tables only, and on
 * purpose: the engine's SQLite adapter generates a whole family around each
 * one - `<t>_rels`, `<t>_locales`, `<t>_blocks_<block>`, the array child
 * tables like `eg_orders_items`, and the version mirror `_<t>_v` with its own
 * children. That set changes every time a block or an array field is added, so
 * it is read from sqlite_master here rather than written down anywhere.
 *
 * Two derivations the feature map does not currently give us directly, both
 * mechanical:
 *
 *   - The `eg_` prefix. The map predates the rename and still lists bare base
 *     names, so each is resolved against the live table list, preferring the
 *     prefixed form. A database mid-rename resolves to whichever exists.
 *
 *   - Globals. A feature's globals are listed by slug, not by table, and a
 *     global's table is its slug with dashes as underscores. `seo-settings`
 *     resolves to `eg_seo_settings`, and that table's children come along the
 *     same way as a collection's.
 *
 * Ambiguity is settled by longest match. `eg_media_settings_resizing_...`
 * matches both the `eg_media` family and the `eg_media_settings` family; the
 * longer parent wins, so a settings table is never swept up as a child of the
 * content table whose name happens to prefix it.
 */

import { FEATURES, type FeatureKey } from '@/features/registry'

import { SHARED_PARENTS, isBookkeepingTable } from './protectedTables'

/** Marks the parents that belong to everyone and so to no feature. */
export const SHARED_OWNER = '@shared' as const

export type TableOwner = FeatureKey | typeof SHARED_OWNER

export type ResolvedParent = {
  /** The table name as it exists right now. */
  table: string
  /** What the feature map called it before resolution, for the report. */
  declaredAs: string
  owners: TableOwner[]
}

export type OwnedTable = {
  table: string
  parent: string
  owners: TableOwner[]
}

/** A global's table name is its slug with dashes swapped for underscores. */
export const globalTableBase = (slug: string): string => slug.replace(/-/g, '_')

/**
 * Picks the name a declared base table actually goes by in this database.
 * Returns null when neither form is present - a feature whose tables have
 * never been created has nothing to clean up, which is not an error.
 */
export function resolveParent(base: string, present: Set<string>): string | null {
  if (present.has(`eg_${base}`)) return `eg_${base}`
  if (present.has(base)) return base
  return null
}

/**
 * True when `table` is part of `parent`'s family: the parent itself, any child
 * the adapter hangs off it, or the version mirror and the version mirror's own
 * children.
 */
export function inFamily(parent: string, table: string): boolean {
  if (table === parent) return true
  if (table.startsWith(`${parent}_`)) return true
  const version = `_${parent}_v`
  return table === version || table.startsWith(`${version}_`)
}

/** Every base table the feature map claims for a feature, before resolution. */
export function declaredBasesFor(key: FeatureKey): string[] {
  const feature = FEATURES.find((entry) => entry.key === key)
  if (!feature) return []
  return [...feature.tables, ...feature.globals.map(globalTableBase)]
}

/**
 * Resolves every feature's declared bases, plus the shared parents, against
 * the live table list. A base claimed by more than one feature comes back with
 * more than one owner, which is what lets the planner refuse a drop that would
 * take another switched-on feature's data with it.
 */
export function resolveParents(tables: string[]): ResolvedParent[] {
  const present = new Set(tables)
  const byTable = new Map<string, ResolvedParent>()

  const claim = (base: string, owner: TableOwner): void => {
    const table = resolveParent(base, present)
    if (!table) return

    const existing = byTable.get(table)
    if (existing) {
      if (!existing.owners.includes(owner)) existing.owners.push(owner)
      return
    }
    byTable.set(table, { table, declaredAs: base, owners: [owner] })
  }

  // Shared first, so a feature that also declares eg_pages is recorded as a
  // co-owner of something shared rather than as its sole owner.
  for (const base of SHARED_PARENTS) claim(base.replace(/^eg_/, ''), SHARED_OWNER)
  for (const feature of FEATURES) {
    for (const base of declaredBasesFor(feature.key)) claim(base, feature.key)
  }

  return [...byTable.values()]
}

/**
 * Assigns each live table to the parent that claims it, longest match wins.
 * Bookkeeping tables are dropped from consideration here rather than later, so
 * nothing downstream ever holds a plan containing one.
 */
export function assignTables(tables: string[], parents: ResolvedParent[]): OwnedTable[] {
  const byLength = [...parents].sort((a, b) => b.table.length - a.table.length)
  const owned: OwnedTable[] = []

  for (const table of tables) {
    if (isBookkeepingTable(table)) continue
    const parent = byLength.find((candidate) => inFamily(candidate.table, table))
    if (!parent) continue
    owned.push({ table, parent: parent.table, owners: parent.owners })
  }

  return owned
}

/**
 * Child tables have to go before the table they hang off, or D1's foreign keys
 * reject the drop. Depth stands in for the dependency: a version mirror or a
 * block child always has a longer name than its parent, so descending length
 * puts children first without needing to read the foreign keys themselves.
 */
export function dropOrder(tables: string[]): string[] {
  return [...tables].sort((a, b) => b.length - a.length || a.localeCompare(b))
}
