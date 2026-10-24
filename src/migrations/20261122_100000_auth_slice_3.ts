import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Auth slice 3: two-step enforcement by role, email codes as a second step, trusted devices.
//   1. Five flat fields on the Security global (`eg_security_settings`), all off or default:
//      two_factor_required_roles (text, empty), two_factor_grace_ends_at (text, null),
//      two_factor_email_otp_enabled (0), trusted_devices_enabled (0), trusted_device_days (30).
//      Mirror: the twoFactor*/trustedDevice* fields in src/globals/SecuritySettings.ts.
//      Change one, change the other.
//   2. `eg_two_factor_email_codes`: one row per emailed second-step code (hash only, attempts,
//      expiry). Mirror: src/cms/db/schema/twoFactorEmailCodes.ts.
//   3. `eg_trusted_devices`: one row per remembered device (hash of the cookie secret only).
//      Mirror: src/cms/db/schema/trustedDevices.ts.
// API key scopes need no migration: `eg_api_keys.scopes` already holds a JSON array of strings, and
// the old values "read" and "write" are read as "*:read" and "*:write".
// Idempotent: a column or table that is already there is left alone. Registered last in
// src/migrations/index.ts.

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

export const SECURITY_SETTINGS_AUTH_SLICE_3_COLUMNS: Array<[column: string, type: string]> = [
  ['two_factor_required_roles', 'text'],
  ['two_factor_grace_ends_at', 'text'],
  ['two_factor_email_otp_enabled', 'integer DEFAULT 0'],
  ['trusted_devices_enabled', 'integer DEFAULT 0'],
  ['trusted_device_days', 'integer DEFAULT 30'],
]

export const TWO_FACTOR_EMAIL_CODES_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_two_factor_email_codes\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer NOT NULL,
  \`purpose\` text NOT NULL,
  \`code_hash\` text NOT NULL,
  \`attempts\` integer DEFAULT 0 NOT NULL,
  \`created_at\` text NOT NULL,
  \`expires_at\` text NOT NULL,
  \`used_at\` text
)`

export const TRUSTED_DEVICES_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_trusted_devices\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` integer NOT NULL,
  \`token_hash\` text NOT NULL,
  \`label\` text,
  \`ip\` text,
  \`created_at\` text NOT NULL,
  \`last_used_at\` text,
  \`expires_at\` text NOT NULL,
  \`revoked_at\` text
)`

export const AUTH_SLICE_3_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_two_factor_email_codes_user_idx` ON `eg_two_factor_email_codes` (`user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_trusted_devices_user_idx` ON `eg_trusted_devices` (`user_id`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_trusted_devices_hash_idx` ON `eg_trusted_devices` (`token_hash`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_AUTH_SLICE_3_COLUMNS)
  await db.run(sql.raw(TWO_FACTOR_EMAIL_CODES_TABLE))
  await db.run(sql.raw(TRUSTED_DEVICES_TABLE))
  for (const statement of AUTH_SLICE_3_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Two-step enforcement columns, eg_two_factor_email_codes and eg_trusted_devices are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - auth slice 3 columns and tables are left in place.')
}
