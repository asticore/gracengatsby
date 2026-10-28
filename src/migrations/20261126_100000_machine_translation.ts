import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Machine translation (src/features/multilingual/machine).
 *   1. The `translation` group on the Integrations global: the Google Cloud Translation and
 *      DeepL keys (encrypted, like the other keys there) and the DeepL plan. Columns are
 *      `translation_*`, as src/cms/db/schema/generate.ts names a group's fields.
 *   2. Four machine fields in the `multilingual` group of the Languages global: enabled,
 *      default provider, per-language overrides (JSON) and the monthly character limit.
 *   3. `eg_machine_translation_usage`: one row per successful provider call, with the
 *      characters sent. Counts only, never the text. Raw SQL, like ai_builder_usage.
 * Mirror: src/globals/Integrations.ts and src/globals/LanguageSettings.ts. Change one, change the other.
 * Idempotent: a column that is already there is left alone; the table is CREATE IF NOT EXISTS.
 * Registered last in src/migrations/index.ts.
 */

// A fresh install builds these tables from the global configs, so the columns can already be there.
// Check first rather than catching the error, because the driver wraps it in its own message.
const columnsOf = async (db: Runner, table: string): Promise<string[]> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return rows.map((r) => r.name)
}

const addColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<void> => {
  const existing = await columnsOf(db, table)
  for (const [column, type] of columns) {
    if (existing.includes(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
  return rows.length > 0
}

export const INTEGRATIONS_COLUMNS: Array<[column: string, type: string]> = [
  ['translation_google_api_key', 'text'],
  ['translation_deepl_api_key', 'text'],
  ['translation_deepl_plan', "text DEFAULT 'auto'"],
]

export const LANGUAGE_SETTINGS_COLUMNS: Array<[column: string, type: string]> = [
  ['multilingual_machine_enabled', 'integer DEFAULT 0'],
  ['multilingual_machine_default_provider', 'text'],
  ['multilingual_machine_overrides', 'text'],
  ['multilingual_machine_monthly_char_limit', 'numeric DEFAULT 0'],
]

const USAGE_TABLE =
  'CREATE TABLE IF NOT EXISTS `eg_machine_translation_usage` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `created_at` text NOT NULL, `provider` text NOT NULL, `locale` text NOT NULL, `chars` integer DEFAULT 0 NOT NULL, `ok` integer DEFAULT 1 NOT NULL)'

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (await tableExists(db, 'eg_integrations')) await addColumns(db, 'eg_integrations', INTEGRATIONS_COLUMNS)
  if (await tableExists(db, 'eg_language_settings')) await addColumns(db, 'eg_language_settings', LANGUAGE_SETTINGS_COLUMNS)
  await db.run(sql.raw(USAGE_TABLE))
  await db.run(
    sql.raw('CREATE INDEX IF NOT EXISTS `eg_machine_translation_usage_created_at_idx` ON `eg_machine_translation_usage` (`created_at`)'),
  )
  engine.logger.info('[migrate] Machine translation keys, settings and usage table are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, like the other migrations here: keys and usage history are configuration and records.
  engine.logger.info('[migrate] Down is a no-op - machine translation columns and usage table are left in place.')
}
