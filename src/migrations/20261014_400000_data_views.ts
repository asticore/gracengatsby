import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Tables and charts: the `data-views` collection (eg_data_views) and its document-locking join column.
// Idempotent: every statement can be replayed. Column names are what src/cms/db/schema/generate.ts
// produces for src/features/dataViews/collections/DataViews.ts. Change one, change both.

type Runner = MigrateUpArgs['db']

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

const TABLE = `CREATE TABLE IF NOT EXISTS \`eg_data_views\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`title\` text NOT NULL,
  \`kind\` text DEFAULT 'table' NOT NULL,
  \`source\` text DEFAULT 'custom-fields' NOT NULL,
  \`slug\` text,
  \`is_public\` integer DEFAULT false,
  \`config\` text,
  \`updated_at\` text DEFAULT ${NOW} NOT NULL,
  \`created_at\` text DEFAULT ${NOW} NOT NULL
)`

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_data_views_slug_idx` ON `eg_data_views` (`slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_data_views_updated_at_idx` ON `eg_data_views` (`updated_at`)',
]

const COLUMNS: Array<[string, string]> = [
  ['title', 'text'],
  ['kind', "text DEFAULT 'table'"],
  ['source', "text DEFAULT 'custom-fields'"],
  ['slug', 'text'],
  ['is_public', 'integer DEFAULT false'],
  ['config', 'text'],
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((row) => row.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))

  // A table created by an earlier partial run may lack columns: add what is missing.
  const have = await columnsOf(db, 'eg_data_views')
  for (const [name, type] of COLUMNS) {
    if (!have.has(name)) await db.run(sql.raw(`ALTER TABLE \`eg_data_views\` ADD COLUMN \`${name}\` ${type}`))
  }
  for (const statement of INDEXES) await db.run(sql.raw(statement))

  // Document locking needs a join column per registered collection.
  const locked = await columnsOf(db, 'eg_locked_documents_rels')
  if (locked.size > 0) {
    if (!locked.has('eg_data_views_id')) await db.run(sql.raw('ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_data_views_id` integer'))
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_data_views_id_idx` ON `eg_locked_documents_rels` (`eg_data_views_id`)'))
  }
  engine.logger.info('[migrate] data views table ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
