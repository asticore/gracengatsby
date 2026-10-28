import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Per-user admin interface language: one text column on eg_users,
 * `admin_language`. NULL and 'auto' both mean "follow the browser"; any other
 * value is an admin locale code (src/features/uiStrings/locales.ts).
 *
 * Mirror: the `adminLanguage` field in src/collections/Users.ts. Change one,
 * change the other.
 * Idempotent: the column is added only when missing. Registered last in
 * src/migrations/index.ts. Fresh installs reach it through runInternalMigrate.
 */

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'eg_users', 'admin_language'))) {
    await db.run(sql.raw('ALTER TABLE `eg_users` ADD COLUMN `admin_language` TEXT'))
  }
  engine.logger.info('[migrate] Per-user admin interface language column is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the admin_language column is left in place.')
}
