/**
 * The additive schema-diff sets applied by `runInternalMigrate` (see that
 * file's header comment for the full fresh-install sequence these fit into).
 *
 * Extracted out of `/api/internal-migrate/route.ts` so both the route and
 * `tests/int/internal-migrate-fresh-install.int.spec.ts` import the exact
 * same definitions - a route file is never imported by a test in this
 * project (no precedent for it anywhere in `tests/`), so this had to live in
 * a plain module either way once the fresh-install proof needed it directly.
 *
 * Each set was generated before the `eg_` table-prefix rename and still
 * names the PRE-rename tables (`posts`, `pages`, `media`, ...) - see
 * `withoutRenamedTables`'s own doc comment for why that is correct rather
 * than a bug.
 */
import type { SchemaColumn, SchemaIndex, SchemaTable } from './builderSchema'

import { NEW_COLUMNS, NEW_INDEXES, NEW_TABLES } from './builderSchema'
import { LOCKED_DOCUMENTS_RELS_COLUMNS } from './lockedDocumentsRelsSchema'
import { SETTINGS_COLUMNS, SETTINGS_INDEXES, SETTINGS_TABLES } from './settingsSchema'

/** Schema sets are applied in order; later sets may depend on earlier ones. */
export const SCHEMA_SETS = [
  { name: 'page-builder', tables: NEW_TABLES, columns: NEW_COLUMNS, indexes: NEW_INDEXES },
  { name: 'settings', tables: SETTINGS_TABLES, columns: SETTINGS_COLUMNS, indexes: SETTINGS_INDEXES },
  { name: 'locked-documents-rels', tables: [], columns: LOCKED_DOCUMENTS_RELS_COLUMNS, indexes: [] },
]

/**
 * Pulls the table an index is created on out of its `CREATE INDEX ... ON
 * \`table\` (...)` statement, so index entries can be filtered by table like
 * the table and column entries already are.
 */
const indexTarget = (statement: string): string => statement.match(/\sON\s+`([^`]+)`/)?.[1] ?? ''

/**
 * The schema sets above were generated before the rename and still name the
 * pre-`eg_` tables. Once a table has been renamed, its old name must not be
 * touched again: `CREATE TABLE IF NOT EXISTS \`pages_blocks_hero\`` would
 * happily create a second, empty table under the retired name.
 *
 * So every entry whose table has already moved is dropped. That is not a loss -
 * the rename carried those tables, columns and indexes over intact, so the
 * additions are already present under the new name. Entries for tables that
 * have NOT been renamed yet (a database still mid-upgrade, or - since
 * `runInternalMigrate` - a genuinely fresh install between its foundation
 * migrations and its own rename pass) are left in.
 */
export function withoutRenamedTables<T extends { tables: SchemaTable[]; columns: SchemaColumn[]; indexes: SchemaIndex[] }>(
  set: T,
  renamedAway: Set<string>,
): Pick<T, 'tables' | 'columns' | 'indexes'> {
  return {
    tables: set.tables.filter((entry) => !renamedAway.has(entry.table)),
    columns: set.columns.filter((entry) => !renamedAway.has(entry.table)),
    indexes: set.indexes.filter((entry) => !renamedAway.has(indexTarget(entry.sql))),
  }
}
