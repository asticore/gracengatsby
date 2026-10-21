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

/** Site-wide page effects on General settings (group `pageEffects`). All off by default. Idempotent. */
export const PAGE_EFFECT_COLUMNS: Array<[column: string, type: string]> = [
  ['page_effects_enabled', 'integer DEFAULT 0'],
  ['page_effects_cursor', "text DEFAULT 'none'"],
  ['page_effects_scroll_progress', 'integer DEFAULT 0'],
  ['page_effects_reveal_on_scroll', 'integer DEFAULT 0'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of PAGE_EFFECT_COLUMNS) {
    if (!(await columnExists(db, 'eg_site_settings', column))) {
      await db.run(sql.raw(`ALTER TABLE \`eg_site_settings\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; left in place.
}
