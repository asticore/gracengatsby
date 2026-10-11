import { MigrateDownArgs, MigrateUpArgs, sql } from '@/engine/db'

type Runner = MigrateUpArgs['db']

const columnExists = async (db: Runner, table: string, column: string): Promise<boolean> => {
  try {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.some((r) => r.name === column)
  } catch {
    return false
  }
}

/** Columns the media upload rules add to eg_media_settings. */
const MEDIA_SETTINGS_COLUMNS: Array<[column: string, definition: string]> = [
  ['uploads_allowed_extensions', 'text'],
  ['uploads_max_upload_mb', 'numeric'],
]

/**
 * Media upload rules: the editable allow-list of file types and the largest
 * upload, stored on the Media settings global. Idempotent: each column is
 * checked first, so a fresh install (whose schema already has them) and an
 * upgrade both succeed, and running it twice does nothing.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, definition] of MEDIA_SETTINGS_COLUMNS) {
    if (!(await columnExists(db, 'eg_media_settings', column))) {
      await db.run(sql.raw(`ALTER TABLE \`eg_media_settings\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns without rebuilding the table, so this is a no-op.
}
