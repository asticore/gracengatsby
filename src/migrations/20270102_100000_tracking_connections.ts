import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Creates `eg_tracking_connections`, the table behind the `tracking-connections` global
// (src/globals/TrackingConnections.ts): the Meta and TikTok app credentials and the
// encrypted sign-in tokens. Column names mirror src/cms/db/schema/generate.ts for that
// global. Idempotent: CREATE TABLE IF NOT EXISTS, so a re-run changes nothing.

const TRACKING_CONNECTIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_tracking_connections\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`meta_app_id\` text,
  \`meta_app_secret_enc\` text,
  \`meta_access_token_enc\` text,
  \`meta_account_name\` text,
  \`meta_connected_at\` text,
  \`meta_token_expires_at\` text,
  \`meta_error\` text,
  \`tiktok_app_id\` text,
  \`tiktok_app_secret_enc\` text,
  \`tiktok_access_token_enc\` text,
  \`tiktok_account_name\` text,
  \`tiktok_connected_at\` text,
  \`tiktok_error\` text,
  \`updated_at\` text,
  \`created_at\` text
)`

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TRACKING_CONNECTIONS_TABLE))
  engine.logger.info('[migrate] eg_tracking_connections is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the other settings tables: saved app secrets and tokens cannot be rebuilt.
  engine.logger.info('[migrate] Down is a no-op - eg_tracking_connections is left in place.')
}
