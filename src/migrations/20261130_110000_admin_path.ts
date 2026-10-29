import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Customisable admin URL. One text column on the Security global (`eg_security_settings`),
// `admin_path`, holding a single-segment path such as `/studio-7f3`. Empty or missing means
// `/admin`. Mirror: the `adminPath` field in src/globals/SecuritySettings.ts. Change one, change the other.
// Idempotent: the column is added only when missing. Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'eg_security_settings', 'admin_path'))) {
    await db.run(sql.raw("ALTER TABLE `eg_security_settings` ADD COLUMN `admin_path` TEXT DEFAULT '/admin'"))
  }
  engine.logger.info('[migrate] Admin URL column is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the admin_path column is left in place.')
}
