import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Adds sortOrder field to pages collection for ordering sibling pages in the tree view.
//
// Written to be safe to replay, for the same reason the backups and forms migrations
// are: the CLI cannot reach production D1 from this CI environment (see the note on
// the D1 binding in wrangler.jsonc), so every statement has to survive running against
// a database that already has it. Tables and indexes use IF NOT EXISTS; SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so the column adds swallow the duplicate-column error
// instead - see `addColumn`.

type Runner = MigrateUpArgs['db']

/**
 * Adds a column, treating "it is already there" as success.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this migration has to be safe to replay.
 * Only the duplicate-column error is swallowed; anything else still fails the migration.
 */
const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

/**
 * Check if a table exists in the database.
 */
const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
  )) as { name: string }[]
  return rows.length > 0
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  // ---- Pages: sortOrder field ----
  if (await tableExists(db, 'eg_pages')) {
    await addColumn(db, 'eg_pages', 'sort_order', 'numeric DEFAULT 0')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_pages_sort_order_idx` ON `eg_pages` (`sort_order`)'))
  }

  if (await tableExists(db, '_eg_pages_v')) {
    await addColumn(db, '_eg_pages_v', 'version_sort_order', 'numeric DEFAULT 0')
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `_eg_pages_v_version_sort_order_idx` ON `_eg_pages_v` (`version_sort_order`)'))
  }

  engine.logger.info('[migrate] sortOrder column added to pages and pages versions table.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping this column on a rollback
  // would delete important ordering data that has been carefully configured, and that data
  // cannot be reconstructed afterwards.
  engine.logger.info('[migrate] Down is a no-op - sortOrder column is left in place.')
}
