/**
 * Moves the engine's own bookkeeping onto the `eg_` prefix.
 *
 * This has to run BEFORE the migration runner does anything, which is why it
 * is not simply a migration. The runner reads and writes its history table on
 * every invocation, and the config now names that table `eg_migrations`; if
 * the database still calls it `payload_migrations`, the very first query the
 * runner makes fails with "no such table: eg_migrations". The initial
 * migration's frozen SQL creates it under the old name too, so even an empty
 * database cannot bootstrap itself out of this.
 *
 * Three jobs, in order:
 *
 *  1. `ensureMigrationsTable` - guarantees `eg_migrations` exists, by renaming
 *     `payload_migrations` when that is what the database has, or creating it
 *     from scratch on a brand-new database.
 *
 *  2. `applyEngineRenames` - moves the remaining five bookkeeping tables and,
 *     more importantly, the relationship columns in EVERY `_rels` table.
 *     Those columns are named after the TABLE of the collection they point at,
 *     so renaming `users` to `eg_users` left the running config asking for
 *     `eg_users_id` against a column still called `users_id`. Every admin
 *     screen touches document locking, so every admin screen threw - that is
 *     what took the portal down, while the public API kept working because it
 *     never reads the locking tables. The same trap is set in thirteen other
 *     `_rels` tables, which is why the plan is derived from the database
 *     rather than typed out.
 *
 *  3. `dropEmptyLegacyTables` - on a fresh database the initial migration's
 *     frozen SQL still creates the old-named tables, which then cannot be
 *     renamed because the new names are already taken. Any such leftover that
 *     is provably empty is dropped. A leftover with rows in it is never
 *     touched; it is reported instead, so a surprise shows up rather than
 *     being silently deleted.
 *
 * Everything here is idempotent and safe to re-run, which is what lets the
 * same code serve the CLI pre-step, the migration chain and the live
 * /api/internal-migrate endpoint without drifting.
 */

import { renameColumns, renameTables, type ColumnRename, type RenameReport } from './applyRenames'
import { ENGINE_TABLE_RENAMES } from './engineTables'
import { TABLE_RENAMES } from './tableRenames'

/** The three primitives every caller has to supply, whatever its db handle is. */
export type EngineDb = {
  exists: (table: string) => Promise<boolean>
  /** Every table name currently in the database. */
  listTables: () => Promise<string[]>
  columnsOf: (table: string) => Promise<string[]>
  run: (statement: string) => Promise<unknown>
  /** Row count for a table that is known to exist. */
  countRows: (table: string) => Promise<number>
}

/**
 * Column-for-column what the engine's initial migration creates, just under
 * the new name. Only ever used on a database that has no migration history at
 * all - an existing one gets its table renamed instead, so no shape is assumed.
 */
const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_migrations\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text,
  \`batch\` numeric,
  \`updated_at\` text NOT NULL,
  \`created_at\` text NOT NULL
)`

export type BootstrapReport = {
  migrationsTable: 'renamed' | 'created' | 'already-present'
  columns: RenameReport
  tables: RenameReport
  droppedLegacy: string[]
  /** Old-named leftovers that still hold rows, so were left in place. */
  keptLegacy: { table: string; rows: number }[]
}

export async function ensureMigrationsTable(db: EngineDb): Promise<BootstrapReport['migrationsTable']> {
  if (await db.exists('eg_migrations')) return 'already-present'

  if (await db.exists('payload_migrations')) {
    await db.run('ALTER TABLE `payload_migrations` RENAME TO `eg_migrations`')
    return 'renamed'
  }

  await db.run(CREATE_MIGRATIONS_TABLE)
  return 'created'
}

/**
 * Works out which relationship columns still name a pre-`eg_` table.
 *
 * Payload stores a `hasMany` or polymorphic relationship in a side table
 * called `<parent>_rels`, with one foreign-key column per target - and it
 * names that column after the target's TABLE, not its slug. So the moment a
 * collection's table is renamed, every `_rels` column pointing at it has to be
 * renamed in step or the running config asks for a column that isn't there.
 *
 * This is derived from the live database rather than written down because the
 * set is not obvious and it grows every time a relationship field is added -
 * a hand-maintained list would be wrong within a release. Fourteen `_rels`
 * tables carry such columns today, from `eg_locked_documents_rels` (one per
 * lockable collection) down to `orders_rels` (just `transactions_id`).
 *
 * Every rename this project performs is a candidate, engine tables included,
 * and the result is filtered by `renameColumns` against what each table
 * actually has - so a database at any point in the upgrade gets exactly the
 * renames it is still missing, and nothing else.
 */
export async function planRelsColumnRenames(db: EngineDb): Promise<ColumnRename[]> {
  const tables = await db.listTables()
  const relsTables = tables.filter((name) => name.endsWith('_rels'))

  const renames = [...TABLE_RENAMES, ...ENGINE_TABLE_RENAMES]

  const plan: ColumnRename[] = []
  for (const table of relsTables) {
    for (const rename of renames) {
      plan.push({ table, from: `${rename.from}_id`, to: `${rename.to}_id` })
    }
  }

  return plan
}

export async function applyEngineRenames(db: EngineDb): Promise<{
  columns: RenameReport
  tables: RenameReport
}> {
  // Columns first, while each `_rels` table is still under whichever name it
  // currently has - the plan is built from the live table list, so it does not
  // matter how far along the rename this database is.
  const columns = await renameColumns({
    columns: await planRelsColumnRenames(db),
    columnsOf: db.columnsOf,
    renameColumn: (table, from, to) =>
      db.run(`ALTER TABLE \`${table}\` RENAME COLUMN \`${from}\` TO \`${to}\``),
  })

  const tables = await renameTables({
    renames: ENGINE_TABLE_RENAMES,
    exists: db.exists,
    rename: (from, to) => db.run(`ALTER TABLE \`${from}\` RENAME TO \`${to}\``),
  })

  return { columns, tables }
}

export async function dropEmptyLegacyTables(db: EngineDb): Promise<{
  dropped: string[]
  kept: { table: string; rows: number }[]
}> {
  const dropped: string[] = []
  const kept: { table: string; rows: number }[] = []

  for (const entry of ENGINE_TABLE_RENAMES) {
    // Only a table that failed to rename BECAUSE the new name already exists
    // is a leftover. One that is simply still waiting to be renamed is not.
    if (!(await db.exists(entry.from)) || !(await db.exists(entry.to))) continue

    const rows = await db.countRows(entry.from)
    if (rows > 0) {
      kept.push({ table: entry.from, rows })
      continue
    }

    await db.run(`DROP TABLE \`${entry.from}\``)
    dropped.push(entry.from)
  }

  return { dropped, kept }
}

/** The whole sequence, for callers that want all three steps. */
export async function bootstrapEngineTables(db: EngineDb): Promise<BootstrapReport> {
  const migrationsTable = await ensureMigrationsTable(db)
  const { columns, tables } = await applyEngineRenames(db)
  const { dropped, kept } = await dropEmptyLegacyTables(db)

  return { migrationsTable, columns, tables, droppedLegacy: dropped, keptLegacy: kept }
}
