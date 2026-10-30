import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Webhooks builder: signed outgoing webhooks for site events (see src/features/webhooks).
//   1. `eg_webhooks`, one row per webhook: name, address, events (JSON list), optional payload
//      template, the signing secret ENCRYPTED (enc:v1, see src/utilities/secretField.ts), on/off
//      and the per-minute rate limit. Mirror: src/cms/db/schema/webhooks.ts.
//   2. `eg_webhook_deliveries`, the delivery log: one row per attempt chain. It keeps the exact body
//      sent (for replay) and never the signing secret. Status, attempts, next try and last answer
//      code or short error are kept. Removed after 30 days by the cron job.
// Idempotent: IF NOT EXISTS everywhere. Registered last in src/migrations/index.ts.

export const WEBHOOKS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_webhooks\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`name\` text NOT NULL,
  \`description\` text DEFAULT '' NOT NULL,
  \`url\` text NOT NULL,
  \`events\` text NOT NULL,
  \`template\` text,
  \`secret\` text NOT NULL,
  \`enabled\` integer DEFAULT 1 NOT NULL,
  \`rate_per_minute\` integer DEFAULT 60 NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const WEBHOOK_DELIVERIES_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_webhook_deliveries\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`webhook_id\` integer NOT NULL,
  \`delivery_id\` text NOT NULL,
  \`event\` text NOT NULL,
  \`body\` text NOT NULL,
  \`status\` text NOT NULL,
  \`attempts\` integer DEFAULT 0 NOT NULL,
  \`next_attempt_at\` text,
  \`last_status_code\` integer,
  \`last_error\` text,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const WEBHOOK_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_webhook_deliveries_due_idx` ON `eg_webhook_deliveries` (`status`, `next_attempt_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_webhook_deliveries_webhook_idx` ON `eg_webhook_deliveries` (`webhook_id`, `created_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(WEBHOOKS_TABLE))
  await db.run(sql.raw(WEBHOOK_DELIVERIES_TABLE))
  for (const statement of WEBHOOK_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Webhook tables eg_webhooks and eg_webhook_deliveries are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - webhook tables are left in place.')
}
