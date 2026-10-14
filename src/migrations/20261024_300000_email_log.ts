import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_email_log`, the table behind the Email log: one row per email the
// site tried to send (see src/features/email/emailLog.ts).
//
// Written by hand, like the audit log migration, so it is safe to replay on a
// database that already has some of it: `CREATE TABLE IF NOT EXISTS` and
// `CREATE INDEX IF NOT EXISTS` make the whole thing idempotent.
//
// The column names here and the field names on the email-log collection
// (src/collections/EmailLog.ts) must match. Change one, change the other.

const EMAIL_LOG_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_email_log\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`to\` text,
  \`subject\` text,
  \`template\` text,
  \`provider\` text,
  \`status\` text,
  \`error\` text,
  \`html\` text,
  \`text\` text,
  \`resent_from\` numeric,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

// Created_at drives the 90-day retention delete and the default newest-first list.
// Resent_from backs the one-resend-per-minute guard. Status and template are
// filtered in the admin but are small enough to scan, so they stay unindexed.
const EMAIL_LOG_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_email_log_created_at_idx` ON `eg_email_log` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_email_log_resent_from_idx` ON `eg_email_log` (`resent_from`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(EMAIL_LOG_TABLE))
  for (const statement of EMAIL_LOG_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] eg_email_log is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the other migrations here. The log is the record of what was
  // sent, and it is most useful when something has gone wrong.
  engine.logger.info('[migrate] Down is a no-op - the email log is left in place.')
}
