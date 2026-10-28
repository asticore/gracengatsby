import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Machine translation: auto-draft on save (src/features/multilingual/machine/autoDraft.ts).
 * One column on the Languages global's multilingual group: `multilingual_machine_auto_draft`,
 * the switch for drafting changed fields when a source document is saved. Default off.
 * Mirror: `machineAutoDraft` in src/globals/LanguageSettings.ts. Change one, change the other.
 * Idempotent: the column is added only when missing. Registered last in src/migrations/index.ts.
 */

const columnsOf = async (db: Runner, table: string): Promise<string[]> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return rows.map((r) => r.name)
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const existing = await columnsOf(db, 'eg_language_settings')
  if (existing.length > 0 && !existing.includes('multilingual_machine_auto_draft')) {
    await db.run(sql.raw('ALTER TABLE `eg_language_settings` ADD COLUMN `multilingual_machine_auto_draft` integer DEFAULT 0'))
  }
  engine.logger.info('[migrate] Machine translation auto-draft setting is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the auto-draft column is left in place.')
}
