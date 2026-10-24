import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Password policy: the eight rules on the Security settings global, plus the two
// per-account columns the rules need.
//   1. Eight flat fields on `eg_security_settings`. Mirror: the passwordMinLength..
//      passwordMaxAgeDays fields in src/globals/SecuritySettings.ts. Change one, change
//      the other. Defaults reproduce today's behaviour (minimum length 8, every rule off).
//   2. `eg_users.password_changed_at` (when the password was last set, for the maximum
//      age rule) and `eg_users.password_history_hashes` (JSON list of recent salted hashes,
//      for the no-reuse rule). Neither is on the drizzle users model, the same as the
//      two-factor backup codes column (20261113_100000_two_factor_backup_codes).
// Idempotent: a column that is already there is left alone. Registered last in
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

export const SECURITY_SETTINGS_PASSWORD_COLUMNS: Array<[column: string, type: string]> = [
  ['password_min_length', 'integer DEFAULT 8'],
  ['password_require_mixed_case', 'integer DEFAULT 0'],
  ['password_require_number', 'integer DEFAULT 0'],
  ['password_require_symbol', 'integer DEFAULT 0'],
  ['password_block_common', 'integer DEFAULT 0'],
  ['password_breach_check', 'integer DEFAULT 0'],
  ['password_history_count', 'integer DEFAULT 0'],
  ['password_max_age_days', 'integer DEFAULT 0'],
]

export const USERS_PASSWORD_COLUMNS: Array<[column: string, type: string]> = [
  ['password_changed_at', 'text'],
  ['password_history_hashes', 'text'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_PASSWORD_COLUMNS)
  await addColumns(db, 'eg_users', USERS_PASSWORD_COLUMNS)
  engine.logger.info('[migrate] Password policy columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: SQLite cannot drop columns cheaply.
  engine.logger.info('[migrate] Down is a no-op - password policy columns are left in place.')
}
