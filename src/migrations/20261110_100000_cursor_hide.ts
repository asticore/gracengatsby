import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

/** Site-wide effects: hide the system pointer while the custom cursor is on. Idempotent. */
export const CURSOR_HIDE_COLUMNS: Array<[column: string, type: string]> = [['page_effects_hide_native_cursor', 'integer DEFAULT 0']]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of CURSOR_HIDE_COLUMNS) {
    if (!(await columnExists(db, 'eg_site_settings', column))) {
      await db.run(sql.raw(`ALTER TABLE \`eg_site_settings\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; left in place.
}
