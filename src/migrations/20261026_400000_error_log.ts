import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_error_log`, the table behind the Error log: one row per distinct
// error the site ran into, with a count of repeats (see src/features/errors/log.ts).
//
// Written by hand, like the email log migration, so it is safe to replay on a
// database that already has some of it: `CREATE TABLE IF NOT EXISTS` and
// `CREATE INDEX IF NOT EXISTS` make the whole thing idempotent.
//
// The column names here and the field names on the error-log collection
// (src/collections/ErrorLog.ts) must match. Change one, change the other.

const ERROR_LOG_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_error_log\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`source\` text,
  \`message\` text,
  \`stack\` text,
  \`path\` text,
  \`user_agent\` text,
  \`count\` numeric,
  \`first_seen\` text,
  \`last_seen\` text,
  \`fingerprint\` text,
  \`status\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

// Fingerprint finds the entry a repeat belongs to. Last_seen drives the 24-hour
// repeat window, the oldest-first trim, and the 30-day removal of resolved entries.
// Status is filtered on those paths too, but the table is capped at 1000 rows, so
// it stays unindexed.
const ERROR_LOG_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_error_log_fingerprint_idx` ON `eg_error_log` (`fingerprint`)',
  'CREATE INDEX IF NOT EXISTS `eg_error_log_last_seen_idx` ON `eg_error_log` (`last_seen`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(ERROR_LOG_TABLE))
  for (const statement of ERROR_LOG_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_error_log is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the other migrations here. The log is most useful when something has gone wrong.
  engine.logger.info('[migrate] Down is a no-op - the error log is left in place.')
}
