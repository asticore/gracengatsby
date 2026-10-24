import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Two-factor sign-in: a users column for the hashed backup codes and a security
// settings switch for customers. The other two-factor users columns already
// exist (20260827_100000_security_audit_log). Idempotent: a table or column
// that is already there is left alone.

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

export const USERS_TWO_FACTOR_COLUMNS: Array<[column: string, type: string]> = [
  ['two_factor_backup_hashes', 'text'],
]

export const SECURITY_SETTINGS_TWO_FACTOR_COLUMNS: Array<[column: string, type: string]> = [
  ['login_protection_require_two_factor_for_members', 'integer DEFAULT 0'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addColumns(db, 'eg_users', USERS_TWO_FACTOR_COLUMNS)
  await addColumns(db, 'eg_security_settings', SECURITY_SETTINGS_TWO_FACTOR_COLUMNS)
  engine.logger.info('[migrate] Two-factor backup code and customer setting columns added.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: SQLite cannot drop columns cheaply.
  engine.logger.info('[migrate] Down is a no-op - two-factor columns are left in place.')
}
