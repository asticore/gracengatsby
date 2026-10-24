import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Per-user API keys with scopes (bearer tokens for the REST API).
//   1. Four flat fields on the Security global (`eg_security_settings`), all off or default
//      by design: api_keys_enabled (0), api_keys_allow_customers (0), api_keys_max_per_user
//      (5), api_keys_max_lifetime_days (365; 0 means keys cannot carry an expiry). Mirror:
//      the apiKeys fields in src/globals/SecuritySettings.ts. Change one, change the other.
//   2. `eg_api_keys`, one row per key. Only the SHA-256 hash of the full key is stored, plus
//      an 8-character display prefix. Mirror: src/cms/db/schema/apiKeys.ts.
// Idempotent: a column or table that is already there is left alone. Registered last
// in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<string[]> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

const addColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<void> => {
  const existing = await columnsOf(db, table)
  if (existing.length === 0) return // table not present
  for (const [column, type] of columns) {
    if (existing.includes(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  }
}

export const SECURITY_SETTINGS_API_KEY_COLUMNS: Array<[column: string, type: string]> = [
  ['api_keys_enabled', 'integer DEFAULT 0'],
  ['api_keys_allow_customers', 'integer DEFAULT 0'],
  ['api_keys_max_per_user', 'integer DEFAULT 5'],
  ['api_keys_max_lifetime_days', 'integer DEFAULT 365'],
]

export const API_KEYS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_api_keys\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer NOT NULL,
  \`name\` text NOT NULL,
  \`prefix\` text NOT NULL,
  \`key_hash\` text NOT NULL,
  \`scopes\` text NOT NULL,
  \`created_at\` text NOT NULL,
  \`last_used_at\` text,
  \`expires_at\` text,
  \`revoked_at\` text
)`

export const API_KEYS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_api_keys_hash_idx` ON `eg_api_keys` (`key_hash`)',
  'CREATE INDEX IF NOT EXISTS `eg_api_keys_user_idx` ON `eg_api_keys` (`user_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_API_KEY_COLUMNS)
  await db.run(sql.raw(API_KEYS_TABLE))
  for (const statement of API_KEYS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] API key columns and eg_api_keys are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and the table are left in place.
  engine.logger.info('[migrate] Down is a no-op - API key columns and table are left in place.')
}
