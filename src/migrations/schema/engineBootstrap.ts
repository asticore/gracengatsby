/**
 * Prepares the engine's own bookkeeping before the migration runner starts.
 *
 * This has to run BEFORE the migration runner does anything, which is why it
 * is not simply a migration: the runner reads and writes its history table
 * (`eg_migrations`) on every invocation, so that table must already exist.
 *
 * Two jobs, in order:
 *
 *  1. `ensureMigrationsTable` - creates `eg_migrations` when the database has
 *     no migration history yet.
 *
 *  2. `applyRelsColumnRenames` - relationship columns in EVERY `_rels` table
 *     are named after the TABLE of the collection they point at, so renaming
 *     `users` to `eg_users` leaves the running config asking for `eg_users_id`
 *     against a column still called `users_id`. The plan is derived from the
 *     live database rather than typed out, because the set grows every time a
 *     relationship field is added.
 *
 * Everything here is idempotent and safe to re-run, which is what lets the
 * same code serve the CLI pre-step, the migration chain and the live
 * /api/internal-migrate endpoint without drifting.
 */

import { renameColumns, type ColumnRename, type RenameReport } from './applyRenames'
import { TABLE_RENAMES } from './tableRenames'

/** The primitives every caller has to supply, whatever its db handle is. */
export type EngineDb = {
  exists: (table: string) => Promise<boolean>
  /** Every table name currently in the database. */
  listTables: () => Promise<string[]>
  columnsOf: (table: string) => Promise<string[]>
  run: (statement: string) => Promise<unknown>
  /** Row count for a table that is known to exist. */
  countRows: (table: string) => Promise<number>
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_migrations\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text,
  \`batch\` numeric,
  \`updated_at\` text NOT NULL,
  \`created_at\` text NOT NULL
)`

export type BootstrapReport = {
  migrationsTable: 'created' | 'already-present'
  columns: RenameReport
}

export async function ensureMigrationsTable(db: EngineDb): Promise<BootstrapReport['migrationsTable']> {
  if (await db.exists('eg_migrations')) return 'already-present'
  await db.run(CREATE_MIGRATIONS_TABLE)
  return 'created'
}

/**
 * Works out which relationship columns still name a pre-`eg_` table.
 *
 * Every table rename this project performs is a candidate, and the result is
 * filtered by `renameColumns` against what each table actually has - so a
 * database at any point in the upgrade gets exactly the renames it is still
 * missing, and nothing else.
 */
export async function planRelsColumnRenames(db: EngineDb): Promise<ColumnRename[]> {
  const tables = await db.listTables()
  const relsTables = tables.filter((name) => name.endsWith('_rels'))

  const plan: ColumnRename[] = []
  for (const table of relsTables) {
    for (const rename of TABLE_RENAMES) {
      plan.push({ table, from: `${rename.from}_id`, to: `${rename.to}_id` })
    }
  }

  return plan
}

export async function applyRelsColumnRenames(db: EngineDb): Promise<RenameReport> {
  return renameColumns({
    columns: await planRelsColumnRenames(db),
    columnsOf: db.columnsOf,
    renameColumn: (table, from, to) =>
      db.run(`ALTER TABLE \`${table}\` RENAME COLUMN \`${from}\` TO \`${to}\``),
  })
}

/** The whole sequence, for callers that want both steps. */
export async function bootstrapEngineTables(db: EngineDb): Promise<BootstrapReport> {
  const migrationsTable = await ensureMigrationsTable(db)
  const columns = await applyRelsColumnRenames(db)
  return { migrationsTable, columns }
}
