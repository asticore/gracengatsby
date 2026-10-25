import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Auth slice 2: verified email, shared rate limits.
//   1. Two flat fields on the Security global (`eg_security_settings`), both safe by default:
//      email_verification_required (0: customers may sign in unverified, as before) and
//      email_verification_cooldown_seconds (60: least gap between two verification emails).
//      Mirror: the emailVerification* fields in src/globals/SecuritySettings.ts.
//   2. `eg_email_verifications`, one row per verification email sent: only the SHA-256 of the
//      token is stored. Mirror: src/cms/db/schema/emailVerifications.ts.
//   3. `eg_rate_limits`, fixed-window counters shared by every isolate. Mirror:
//      src/cms/db/schema/rateLimits.ts.
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

export const SECURITY_SETTINGS_VERIFICATION_COLUMNS: Array<[column: string, type: string]> = [
  ['email_verification_required', 'integer DEFAULT 0'],
  ['email_verification_cooldown_seconds', 'integer DEFAULT 60'],
]

export const EMAIL_VERIFICATIONS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_email_verifications\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` integer NOT NULL,
  \`email\` text NOT NULL,
  \`token_hash\` text NOT NULL,
  \`created_at\` text NOT NULL,
  \`expires_at\` text NOT NULL,
  \`used_at\` text
)`

export const EMAIL_VERIFICATIONS_INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_email_verifications_token_idx` ON `eg_email_verifications` (`token_hash`)',
  'CREATE INDEX IF NOT EXISTS `eg_email_verifications_user_idx` ON `eg_email_verifications` (`user_id`)',
]

export const RATE_LIMITS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_rate_limits\` (
  \`key\` text NOT NULL,
  \`window_start\` integer NOT NULL,
  \`count\` integer DEFAULT 0 NOT NULL,
  \`expires_at\` integer NOT NULL,
  PRIMARY KEY(\`key\`, \`window_start\`)
)`

export const RATE_LIMITS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_rate_limits_expires_idx` ON `eg_rate_limits` (`expires_at`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_VERIFICATION_COLUMNS)
  await db.run(sql.raw(EMAIL_VERIFICATIONS_TABLE))
  for (const statement of EMAIL_VERIFICATIONS_INDEXES) await db.run(sql.raw(statement))
  await db.run(sql.raw(RATE_LIMITS_TABLE))
  for (const statement of RATE_LIMITS_INDEXES) await db.run(sql.raw(statement))
  engine.logger.info('[migrate] Email verification settings, eg_email_verifications and eg_rate_limits are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and tables are left in place.
  engine.logger.info('[migrate] Down is a no-op - verification columns and rate limit tables are left in place.')
}
