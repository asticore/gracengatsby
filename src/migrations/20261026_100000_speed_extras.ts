import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Wave 17, Task A: the hover-prefetch switch on the Speed settings, and the Data clean-up group.
// Column names are what src/cms/db/schema/generate.ts produces for the group fields in
// src/globals/SpeedSettings.ts. Idempotent: every statement checks PRAGMA table_info first.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

const addMissing = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  const cols = await columnsOf(db, table)
  if (cols.size === 0) return
  if (!cols.has(column)) await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
}

const COLUMNS: [string, string][] = [
  ['advanced_preload_on_hover', 'integer DEFAULT true'],
  ['cleanup_enabled', 'integer DEFAULT false'],
  ['cleanup_keep_versions_per_doc', 'numeric DEFAULT 20'],
  ['cleanup_delete_trashed_after_days', 'numeric DEFAULT 30'],
  ['cleanup_delete_form_submissions_after_days', 'numeric DEFAULT 0'],
  ['cleanup_delete_audit_log_after_days', 'numeric DEFAULT 180'],
  ['cleanup_delete_email_log_after_days', 'numeric DEFAULT 90'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of COLUMNS) {
    await addMissing(db, 'eg_speed_settings', column, type)
  }
  engine.logger.info('[migrate] speed extras and data clean-up columns ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {}