import { MigrateUpArgs, sql } from '@/engine/db'

/**
 * Social accounts: the `socialAccounts` array on the Integrations global (Social feed element). A child table in
 * the same shape as eg_integrations_consent_cookie_list. The access token column holds `enc:v1:` ciphertext.
 * Idempotent: the table and indexes are only created when missing.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='eg_integrations'`)) as { name: string }[]
  if (!rows.length) return
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`eg_integrations_social_accounts\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`provider\` text DEFAULT 'instagram',
    \`label\` text,
    \`account_id\` text,
    \`access_token\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`eg_integrations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_integrations_social_accounts_order_idx` ON `eg_integrations_social_accounts` (`_order`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_integrations_social_accounts_parent_id_idx` ON `eg_integrations_social_accounts` (`_parent_id`)'))
}

export async function down(): Promise<void> {
  // Left in place: dropping the table would delete saved connections.
}
