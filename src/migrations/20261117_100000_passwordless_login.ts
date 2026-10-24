import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Passwordless sign-in: an emailed magic link and a six-digit email code.
//   1. Four flat fields on the Security global (`eg_security_settings`), all off by
//      default: magic_link_enabled, email_code_enabled, allow_passwordless_for_admins,
//      passwordless_token_minutes (15). Mirror: the passwordless fields in
//      src/globals/SecuritySettings.ts. Change one, change the other.
//   2. `eg_login_tokens`, one row per issued link or code. Only a SHA-256 hash is
//      stored (a salted hash for codes). Mirror: src/cms/db/schema/loginTokens.ts.
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

export const SECURITY_SETTINGS_PASSWORDLESS_COLUMNS: Array<[column: string, type: string]> = [
  ['magic_link_enabled', 'integer DEFAULT 0'],
  ['email_code_enabled', 'integer DEFAULT 0'],
  ['allow_passwordless_for_admins', 'integer DEFAULT 0'],
  ['passwordless_token_minutes', 'integer DEFAULT 15'],
]

export const LOGIN_TOKENS_TABLE = `CREATE TABLE IF NOT EXISTS \`eg_login_tokens\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`user_id\` integer NOT NULL,
  \`kind\` text NOT NULL,
  \`token_hash\` text NOT NULL,
  \`attempts\` integer DEFAULT 0 NOT NULL,
  \`created_at\` text NOT NULL,
  \`expires_at\` text NOT NULL,
  \`used_at\` text
)`

export const LOGIN_TOKENS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_login_tokens_user_idx` ON `eg_login_tokens` (`user_id`, `kind`)',
  'CREATE INDEX IF NOT EXISTS `eg_login_tokens_hash_idx` ON `eg_login_tokens` (`token_hash`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_PASSWORDLESS_COLUMNS)
  await db.run(sql.raw(LOGIN_TOKENS_TABLE))
  for (const statement of LOGIN_TOKENS_INDEXES) {
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] Passwordless sign-in columns and eg_login_tokens are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: columns and the table are left in place.
  engine.logger.info('[migrate] Down is a no-op - passwordless sign-in columns and table are left in place.')
}
