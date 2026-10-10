import { MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const TABLE = 'eg_seo_settings'
const SELECT_TABLE = 'eg_seo_settings_site_files_llms_include_collections'

/** Columns for the `siteFiles` group of SeoSettings, in the order the group declares them. */
const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'site_files_overview', ddl: 'TEXT' },
  { name: 'site_files_llms_enabled', ddl: 'INTEGER DEFAULT true' },
  { name: 'site_files_llms_title', ddl: 'TEXT' },
  { name: 'site_files_llms_summary', ddl: 'TEXT' },
  { name: 'site_files_llms_exclude_paths', ddl: 'TEXT' },
  { name: 'site_files_security_txt_contact', ddl: 'TEXT' },
  { name: 'site_files_security_txt_expires', ddl: 'TEXT' },
  { name: 'site_files_security_txt_policy', ddl: 'TEXT' },
  { name: 'site_files_security_txt_languages', ddl: 'TEXT' },
  { name: 'site_files_security_txt_custom', ddl: 'TEXT' },
  { name: 'site_files_ads_txt', ddl: 'TEXT' },
  { name: 'site_files_app_ads_txt', ddl: 'TEXT' },
  { name: 'site_files_humans_txt', ddl: 'TEXT' },
  { name: 'site_files_manifest_name', ddl: 'TEXT' },
  { name: 'site_files_manifest_short_name', ddl: 'TEXT' },
  { name: 'site_files_manifest_theme_color', ddl: 'TEXT' },
  { name: 'site_files_manifest_background_color', ddl: 'TEXT' },
  { name: 'site_files_manifest_display', ddl: "TEXT DEFAULT 'standalone'" },
  { name: 'site_files_server_response_headers', ddl: 'TEXT' },
  { name: 'site_files_server_blocked_paths', ddl: 'TEXT' },
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
 * Adds the Site files group to eg_seo_settings, plus the child table behind its
 * hasMany select (`llmsIncludeCollections`). Existing rows get the declared
 * defaults from the ALTER TABLE. Idempotent: every step checks first, so this
 * is safe on a fresh install (where the base table comes from the settings
 * schema set) and on an already-migrated database.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await tableExists(db, TABLE))) return

  for (const column of COLUMNS) {
    if (!(await columnExists(db, TABLE, column.name))) {
      await db.run(sql.raw(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${column.name}\` ${column.ddl}`))
    }
  }

  if (!(await tableExists(db, SELECT_TABLE))) {
    await db.run(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS \`${SELECT_TABLE}\` ( \`order\` integer NOT NULL, \`parent_id\` integer NOT NULL, \`value\` text, \`id\` integer PRIMARY KEY NOT NULL, FOREIGN KEY (\`parent_id\`) REFERENCES \`${TABLE}\`(\`id\`) ON UPDATE no action ON DELETE cascade )`,
      ),
    )
  }
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`${SELECT_TABLE}_order_idx\` ON \`${SELECT_TABLE}\` (\`order\`)`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`${SELECT_TABLE}_parent_idx\` ON \`${SELECT_TABLE}\` (\`parent_id\`)`))
}

export async function down(): Promise<void> {
  // SQLite does not support DROP COLUMN, so we skip the down
  // In a production migration, you would need to recreate the table
}
