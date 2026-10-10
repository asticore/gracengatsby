import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

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

/**
 * Add theme_custom_fonts (JSON text) to eg_site_settings for the fonts the
 * admin installs from the Fontsource/Google catalog or uploads. The
 * heading/body font columns already exist and keep their text type.
 * Idempotent: checks the column exists before adding.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'eg_site_settings', 'theme_custom_fonts'))) {
    await db.run(sql.raw(`ALTER TABLE \`eg_site_settings\` ADD COLUMN \`theme_custom_fonts\` TEXT`))
  }
}

export async function down(): Promise<void> {
  // SQLite does not support DROP COLUMN, so we skip the down
  // In a production migration, you would need to recreate the table
}
