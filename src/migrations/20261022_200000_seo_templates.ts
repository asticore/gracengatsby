import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const TABLE = 'eg_seo_settings'

/** Columns for the `templates` group of SeoSettings, in the order the group declares them. */
const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'templates_page_title_template', ddl: 'TEXT' },
  { name: 'templates_page_description_template', ddl: 'TEXT' },
  { name: 'templates_post_title_template', ddl: 'TEXT' },
  { name: 'templates_post_description_template', ddl: 'TEXT' },
  { name: 'templates_product_title_template', ddl: 'TEXT' },
  { name: 'templates_product_description_template', ddl: 'TEXT' },
  { name: 'templates_event_title_template', ddl: 'TEXT' },
  { name: 'templates_event_description_template', ddl: 'TEXT' },
  { name: 'templates_course_title_template', ddl: 'TEXT' },
  { name: 'templates_course_description_template', ddl: 'TEXT' },
]

/**
 * Check if a column exists in a table.
 */
const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> => {
  try {
    const rows = (await db.all(
      sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`),
    )) as { name: string }[]
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * Adds the Templates by content type group to eg_seo_settings: a title and a
 * description template for each of page, post, product, event and course. The
 * columns are left blank by default so existing sites keep their current titles
 * and descriptions until someone fills a template in. Idempotent: every step
 * checks first, so this is safe on a fresh install and on an already-migrated
 * database.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await tableExists(db, TABLE))) return

  for (const column of COLUMNS) {
    if (!(await columnExists(db, TABLE, column.name))) {
      await db.run(sql.raw(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${column.name}\` ${column.ddl}`))
    }
  }
}

export async function down(): Promise<void> {
  // SQLite does not support DROP COLUMN, so we skip the down
  // In a production migration, you would need to recreate the table
}
