import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// API builder: custom endpoints served at /api/x/<version>/<name> (see src/features/apiBuilder).
//   1. `eg_api_endpoints`, one row per endpoint. The definition (fields, filters, sort, page
//      sizes, methods, role, allowed keys, rate limit, format) is one JSON `config` column, so
//      adding a setting later needs no migration. Mirror: src/cms/db/schema/apiEndpoints.ts.
//   2. `eg_api_endpoint_log`, one row per call: who (key and user ids), when, method, status.
//      Never the request or response body, never a key. Kept for 30 days.
//   3. `eg_api_builder_settings`, one row (id 1): whether the public developer guide link is on
//      (off by default) and the random token that link carries. Regenerating the token breaks old links.
// Idempotent: IF NOT EXISTS everywhere. Registered last in src/migrations/index.ts.

export const API_ENDPOINTS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_api_endpoints\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`version\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`name\` text NOT NULL,
  \`collection\` text NOT NULL,
  \`config\` text NOT NULL,
  \`enabled\` integer DEFAULT 1 NOT NULL,
  \`created_at\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const API_ENDPOINT_LOG_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_api_endpoint_log\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`endpoint_id\` integer NOT NULL,
  \`key_id\` integer,
  \`user_id\` integer,
  \`method\` text NOT NULL,
  \`status\` integer NOT NULL,
  \`created_at\` text NOT NULL
)`

export const API_BUILDER_SETTINGS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_api_builder_settings\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`docs_public\` integer DEFAULT 0 NOT NULL,
  \`docs_token\` text NOT NULL,
  \`updated_at\` text NOT NULL
)`

export const API_ENDPOINT_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_api_endpoints_path_idx` ON `eg_api_endpoints` (`version`, `slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_api_endpoint_log_endpoint_idx` ON `eg_api_endpoint_log` (`endpoint_id`, `created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_api_endpoint_log_created_idx` ON `eg_api_endpoint_log` (`created_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(API_ENDPOINTS_TABLE))
  await db.run(sql.raw(API_ENDPOINT_LOG_TABLE))
  await db.run(sql.raw(API_BUILDER_SETTINGS_TABLE))
  for (const statement of API_ENDPOINT_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] API builder tables eg_api_endpoints and eg_api_endpoint_log are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - API builder tables are left in place.')
}
