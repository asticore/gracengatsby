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

/** Columns the media library upgrade adds to eg_media. Types mirror Media.ts. */
const MEDIA_COLUMNS: Array<[column: string, definition: string]> = [
  ['caption', 'TEXT'],
  ['folder', "TEXT DEFAULT ''"],
  ['focal_x', 'numeric DEFAULT 50'],
  ['focal_y', 'numeric DEFAULT 50'],
  ['crop', 'TEXT'],
  ['credit', 'TEXT'],
  ['license', 'TEXT'],
  ['source_url', 'TEXT'],
  ['source', "TEXT DEFAULT 'upload'"],
  ['original_size', 'numeric'],
  ['optimized_size', 'numeric'],
]

/** Columns the media library upgrade adds to eg_media_settings. */
const MEDIA_SETTINGS_COLUMNS: Array<[column: string, definition: string]> = [
  ['optimisation_keep_originals', 'integer DEFAULT false'],
  ['stock_unsplash_access_key', 'TEXT'],
  ['stock_pexels_api_key', 'TEXT'],
  ['stock_pixabay_api_key', 'TEXT'],
]

/**
 * Media library upgrade: folders, captions, focal point, crop presets, sizes
 * before and after optimisation, licence/credit/source, and the encrypted
 * stock photo keys. Idempotent: every column is checked before it is added,
 * so a fresh install (where the schema already has them) and an upgrade both
 * succeed, and running it twice is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, definition] of MEDIA_COLUMNS) {
    if (!(await columnExists(db, 'eg_media', column))) {
      await db.run(sql.raw(`ALTER TABLE \`eg_media\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
  for (const [column, definition] of MEDIA_SETTINGS_COLUMNS) {
    if (!(await columnExists(db, 'eg_media_settings', column))) {
      await db.run(sql.raw(`ALTER TABLE \`eg_media_settings\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
}

export async function down(): Promise<void> {
  // SQLite does not support DROP COLUMN, so we skip the down
  // In a production migration, you would need to recreate the table
}
