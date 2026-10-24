import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Customer email verification: three eg_users columns and one site-settings switch.
// Idempotent: a table or column that is already there is left alone.

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

export const USERS_VERIFICATION_COLUMNS: Array<[column: string, type: string]> = [
  ['email_verified_at', 'text'],
  ['email_verify_token_hash', 'text'],
  ['email_verify_expires_at', 'text'],
]

export const SITE_SETTINGS_VERIFICATION_COLUMNS: Array<[column: string, type: string]> = [
  ['account_settings_require_email_verification', 'integer DEFAULT 0'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_users', USERS_VERIFICATION_COLUMNS)
  await addColumns(db, 'eg_site_settings', SITE_SETTINGS_VERIFICATION_COLUMNS)
  engine.logger.info('[migrate] Email verification columns added.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: SQLite cannot drop columns cheaply.
  engine.logger.info('[migrate] Down is a no-op - email verification columns are left in place.')
}
