import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_google_connection`, the table behind the `google-connection` global
// (src/globals/GoogleConnection.ts): the site's own Google OAuth client, the signed-in
// account and the chosen Analytics, Search Console, Tag Manager and AdSense ids.
// Column names mirror src/cms/db/schema/generate.ts for that global. Idempotent:
// CREATE TABLE IF NOT EXISTS, so a re-run on a finished install changes nothing.

type Runner = MigrateUpArgs['db']

const GOOGLE_CONNECTION_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_google_connection\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`client_id\` text,
  \`client_secret_enc\` text,
  \`refresh_token_enc\` text,
  \`connected_email\` text,
  \`connected_at\` text,
  \`scopes_granted\` text,
  \`ga4_property_id\` text,
  \`ga4_measurement_id\` text,
  \`search_console_site\` text,
  \`gtm_account_id\` text,
  \`gtm_container_id\` text,
  \`adsense_account_id\` text,
  \`adsense_publisher_id\` text,
  \`last_error\` text,
  \`updated_at\` text,
  \`created_at\` text
)`

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(GOOGLE_CONNECTION_TABLE))
  engine.logger.info('[migrate] eg_google_connection is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the other settings tables: a saved client secret cannot be rebuilt.
  engine.logger.info('[migrate] Down is a no-op - eg_google_connection is left in place.')
}
