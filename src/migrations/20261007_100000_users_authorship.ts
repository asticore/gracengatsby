import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Adds authorship tracking (created_by_id, updated_by_id) to users table.
// Written to be safe to replay, matching the pattern from
// 20261002_120000_authorship_page_type_product_seo.ts.

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
  // ---- Users: authorship ----
  if (await tableExists(db, 'eg_users')) {
    await addColumn(db, 'eg_users', 'created_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await addColumn(db, 'eg_users', 'updated_by_id', `integer REFERENCES \`eg_users\`(\`id\`) ON DELETE set null`)
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_users_created_by_idx` ON `eg_users` (`created_by_id`)'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_users_updated_by_idx` ON `eg_users` (`updated_by_id`)'))
  }

  engine.logger.info('[migrate] Authorship columns added to users.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping these columns on a rollback
  // would delete important metadata that has been carefully configured, and that data
  // cannot be reconstructed afterwards.
  engine.logger.info('[migrate] Down is a no-op - authorship columns are left in place.')
}
