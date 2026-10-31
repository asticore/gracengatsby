import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Privacy requests: a customer's request to delete their data, with a 30-day clock (see src/features/privacy).
//   `eg_privacy_requests`, one row per request: the customer id and email at the time, the status
//   (unverified until the emailed link is opened, then new, in_progress, done or rejected), the due
//   date, the hash of the emailed verification token (the token itself is never stored), and a short
//   result summary of what was removed (counts only, no personal data). Mirror: src/cms/db/schema/privacyRequests.ts.
// Idempotent: IF NOT EXISTS everywhere. Registered last in src/migrations/index.ts.

export const PRIVACY_REQUESTS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_privacy_requests\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer,
  \`email\` text NOT NULL,
  \`status\` text NOT NULL,
  \`note\` text DEFAULT '' NOT NULL,
  \`due_at\` text NOT NULL,
  \`verify_hash\` text,
  \`verify_expires_at\` text,
  \`verified_at\` text,
  \`decided_at\` text,
  \`decided_by\` integer,
  \`completed_at\` text,
  \`result\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const PRIVACY_REQUEST_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_privacy_requests_status_idx` ON `eg_privacy_requests` (`status`, `due_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_privacy_requests_user_idx` ON `eg_privacy_requests` (`user_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(PRIVACY_REQUESTS_TABLE))
  for (const statement of PRIVACY_REQUEST_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Privacy request table eg_privacy_requests is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the table is left in place.
  engine.logger.info('[migrate] Down is a no-op - the privacy request table is left in place.')
}
