import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_user_sessions`, the list of signed-in devices behind session
// management. Written by hand like the audit log table: `CREATE TABLE IF NOT
// EXISTS` makes it safe to replay on a database that already has it.
//
// Nothing is added to or changed on any existing table, so a deploy cannot
// affect anyone already signed in: tokens issued before this carry no session
// id and are never checked against this table.
//
// The Drizzle mirror is src/cms/db/schema/userSessions.ts. Change one, change
// the other.

const SESSIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_user_sessions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` integer NOT NULL,
  \`token_hash\` text NOT NULL,
  \`device_label\` text,
  \`ip\` text,
  \`created_at\` text NOT NULL,
  \`last_seen_at\` text,
  \`expires_at\` text NOT NULL,
  \`revoked_at\` text
)`

const SESSIONS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_user_sessions_user_id_idx` ON `eg_user_sessions` (`user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_user_sessions_expires_at_idx` ON `eg_user_sessions` (`expires_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(SESSIONS_TABLE))
  for (const statement of SESSIONS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_user_sessions is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the table is left in place.
  engine.logger.info('[migrate] Down is a no-op - eg_user_sessions is left in place.')
}
