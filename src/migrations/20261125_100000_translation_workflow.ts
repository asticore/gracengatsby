import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Translation workflow (src/features/multilingual/translationStatus.ts).
//   1. `eg_translations` gains the workflow columns: status (default 'approved', so every row
//      already there keeps working as it does now), machine_provider, assigned_to (JSON list of
//      user ids), reviewed_by and reviewed_at. A row with no text is set to 'missing', which is
//      what the rules derive for it anyway.
//   2. `eg_language_settings` (the Languages global) gains require_review, admins_bypass_review
//      and translation_rules (JSON: per language, the translators and reviewers).
// Mirror: src/features/multilingual/translationsCollection.ts and src/globals/LanguageSettings.ts.
// Change one, change the other. Idempotent: a column that is already there is left alone, and the
// backfill only touches rows with no text. Registered last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<string[]> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

const addColumns = async (db: Runner, table: string, columns: Array<[string, string]>): Promise<boolean> => {
  const existing = await columnsOf(db, table)
  if (existing.length === 0) return false // table not present
  for (const [column, type] of columns) {
    if (existing.includes(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  }
  return true
}

export const TRANSLATION_COLUMNS: Array<[column: string, type: string]> = [
  ['status', "text DEFAULT 'approved'"],
  ['machine_provider', 'text'],
  ['assigned_to', 'text'],
  ['reviewed_by', 'integer'],
  ['reviewed_at', 'text'],
]

export const LANGUAGE_SETTINGS_REVIEW_COLUMNS: Array<[column: string, type: string]> = [
  ['multilingual_require_review', 'integer DEFAULT 0'],
  ['multilingual_admins_bypass_review', 'integer DEFAULT 1'],
  ['multilingual_translation_rules', 'text'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const translationsPresent = await addColumns(db, 'eg_translations', TRANSLATION_COLUMNS)
  if (translationsPresent) {
    await db.run(sql.raw("UPDATE `eg_translations` SET `status` = 'missing' WHERE `value` IS NULL OR trim(`value`) = ''"))
  }
  await addColumns(db, 'eg_language_settings', LANGUAGE_SETTINGS_REVIEW_COLUMNS)
  engine.logger.info('[migrate] Translation workflow columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op like the other migrations: the columns hold reviewer and assignment history.
  engine.logger.info('[migrate] Down is a no-op - translation workflow columns are left in place.')
}
