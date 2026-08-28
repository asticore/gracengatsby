import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Creates `eg_audit_log`, the table behind the Security feature's audit trail,
// and adds the two-step sign-in columns to `eg_users`.
//
// Written by hand rather than generated, for the same reason the settings and
// page-builder schema sets are: the CLI's `migrate` cannot reach production D1
// from this CI environment (see the note on the D1 binding in wrangler.jsonc),
// so the statements have to be safe to replay on a database that may already
// have some of them. `CREATE TABLE IF NOT EXISTS` covers the table; SQLite has
// no `ADD COLUMN IF NOT EXISTS`, so each column is checked against
// PRAGMA table_info first.
//
// The column names here and the field names on the audit-log collection are
// two halves of one thing - the collection reads this table directly. Change
// one, change the other.
//
// Deliberately not indexed beyond the three below: entries are written on
// every change and read rarely, so an index that is not used by the default
// admin view (newest first, occasionally filtered by actor or action) would
// cost on every write and earn nothing.

const AUDIT_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_audit_log\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`action\` text NOT NULL,
  \`actor_id\` numeric,
  \`actor_email\` text,
  \`collection_slug\` text,
  \`document_id\` text,
  \`ip\` text,
  \`user_agent\` text,
  \`detail\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const AUDIT_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_audit_log_created_at_idx` ON `eg_audit_log` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_audit_log_action_idx` ON `eg_audit_log` (`action`)',
  'CREATE INDEX IF NOT EXISTS `eg_audit_log_actor_email_idx` ON `eg_audit_log` (`actor_email`)',
]

/** Storage for two-step sign-in. Null on every existing row, which reads as off. */
const USER_COLUMNS: { column: string; sql: string }[] = [
  {
    column: 'two_factor_enabled',
    sql: 'ALTER TABLE `eg_users` ADD `two_factor_enabled` integer DEFAULT false',
  },
  {
    column: 'two_factor_secret',
    sql: 'ALTER TABLE `eg_users` ADD `two_factor_secret` text',
  },
  {
    column: 'two_factor_confirmed_at',
    sql: 'ALTER TABLE `eg_users` ADD `two_factor_confirmed_at` text',
  },
  {
    column: 'two_factor_last_used_step',
    sql: 'ALTER TABLE `eg_users` ADD `two_factor_last_used_step` numeric',
  },
]

export async function up({ db, payload: engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`,
    )) as { name: string }[]
    return rows.length > 0
  }

  const columnsOf = async (table: string): Promise<string[]> => {
    if (!(await exists(table))) return []
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((row) => row.name)
  }

  await db.run(sql.raw(AUDIT_TABLE))
  for (const statement of AUDIT_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_audit_log is present.')

  // The users table only carries the eg_ name once the rename migration has
  // run. If it has not, there is nothing to add the columns to and the next
  // deploy will pick this up - so skip rather than fail the chain.
  if (!(await exists('eg_users'))) {
    engine.logger.warn('[migrate] `eg_users` not found - two-step sign-in columns skipped this run.')
    return
  }

  const existing = new Set(await columnsOf('eg_users'))
  const added: string[] = []

  for (const entry of USER_COLUMNS) {
    if (existing.has(entry.column)) continue
    await db.run(sql.raw(entry.sql))
    added.push(entry.column)
  }

  if (added.length > 0) {
    engine.logger.info(`[migrate] Added to eg_users: ${added.join(', ')}`)
  }
}

export async function down({ payload: engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here. Dropping the audit table on a
  // rollback would destroy the record of what happened during the incident
  // that prompted the rollback, which is precisely when it is worth having.
  engine.logger.info('[migrate] Down is a no-op - the audit log and its columns are left in place.')
}
