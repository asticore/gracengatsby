import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

/**
 * Template browser fields on Page Templates (src/collections/PageTemplates.ts):
 * `kind` (page | section), `category` and the optional `previewImage` upload.
 * Column names are what src/cms/db/schema/generate.ts produces: selects are
 * plain text columns, a single upload is an integer `<name>_id` column.
 * Rows that predate this get kind 'page' and category 'other'.
 *
 * Idempotent: columns are only added when missing, and only NULLs are backfilled.
 */

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  if (await columnExists(db, table, column)) return
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='eg_page_templates'`)) as { name: string }[]
  if (rows.length === 0) return

  await addColumn(db, 'eg_page_templates', 'kind', "text DEFAULT 'page'")
  await addColumn(db, 'eg_page_templates', 'category', "text DEFAULT 'other'")
  await addColumn(db, 'eg_page_templates', 'preview_image_id', 'integer')
  await db.run(sql.raw("UPDATE `eg_page_templates` SET `kind` = 'page' WHERE `kind` IS NULL"))
  await db.run(sql.raw("UPDATE `eg_page_templates` SET `category` = 'other' WHERE `category` IS NULL"))
  engine.logger.info('[migrate] Page template kind, category and preview image columns are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other migrations here: SQLite cannot drop columns cheaply and the values are user data.
  engine.logger.info('[migrate] Down is a no-op - page template kind/category columns are left in place.')
}
