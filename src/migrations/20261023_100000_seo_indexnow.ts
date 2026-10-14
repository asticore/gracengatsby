import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const TABLE = 'eg_seo_settings'

/** Columns for the `indexNow` group of SeoSettings, in the order the group declares them. */
const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'index_now_enabled', ddl: 'INTEGER DEFAULT 0' },
  { name: 'index_now_key', ddl: 'TEXT' },
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
 * Adds the IndexNow group to eg_seo_settings: an on/off switch (off by default,
 * so existing sites send nothing) and the key the search engines check. The key
 * is created by the global's beforeChange hook, not here. Idempotent: every step
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