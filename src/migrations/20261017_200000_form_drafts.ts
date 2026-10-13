import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Save-and-continue for forms: the saved-draft table and the "Allow save and continue" switch on a form.
// Idempotent: the table is CREATE ... IF NOT EXISTS, and every added column is checked with PRAGMA table_info
// first. Column names mirror src/cms/db/schema/generate.ts for the collection FormDrafts under
// src/features/forms/collections and the Forms field allowSaveForLater.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const TABLE = `CREATE TABLE IF NOT EXISTS \`eg_form_drafts\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`form_id\` integer NOT NULL,
  \`token_hash\` text NOT NULL,
  \`email\` text NOT NULL,
  \`data_json\` text NOT NULL,
  \`page\` numeric DEFAULT 0,
  \`expires_at\` text NOT NULL,
${TS}
)`

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_form_drafts_form_idx` ON `eg_form_drafts` (`form_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_form_drafts_token_hash_idx` ON `eg_form_drafts` (`token_hash`)',
  'CREATE INDEX IF NOT EXISTS `eg_form_drafts_expires_at_idx` ON `eg_form_drafts` (`expires_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_form_drafts_id_idx` ON `eg_locked_documents_rels` (`eg_form_drafts_id`)',
]

const COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['eg_forms', 'allow_save_for_later', 'integer DEFAULT 0'],
  ['eg_locked_documents_rels', 'eg_form_drafts_id', 'integer'],
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))
  for (const [table, column, definition] of COLUMNS) {
    const existing = await columnsOf(db, table)
    // A missing table means nothing to alter yet (a partial install); the column arrives with the table.
    if (existing.size > 0 && !existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
  for (const statement of INDEXES) {
    const table = /ON `([^`]+)`/.exec(statement)?.[1]
    if (table && (await columnsOf(db, table)).size === 0) continue
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] save-and-continue drafts ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the saved-draft table and switch are left in place.')
}
