import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

/**
 * Owner overrides for storefront interface text: one text column on
 * eg_language_settings, `interface_overrides`, holding a JSON list of
 * { key, locale, value } entries (src/features/uiStrings/storeTexts.ts).
 *
 * Mirror: the `interfaceOverrides` field in src/globals/LanguageSettings.ts.
 * Idempotent: the column is added only when missing. Registered last in
 * src/migrations/index.ts. Fresh installs reach it through runInternalMigrate.
 */

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
  if (!(await columnExists(db, 'eg_language_settings', 'interface_overrides'))) {
    await db.run(sql.raw('ALTER TABLE `eg_language_settings` ADD COLUMN `interface_overrides` TEXT'))
  }
  engine.logger.info('[migrate] Storefront interface text overrides column is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the interface_overrides column is left in place.')
}
