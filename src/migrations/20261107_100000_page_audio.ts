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

const tableExists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as unknown[]).length > 0

/** Per-page background audio (group `pageAudio` on Pages). Idempotent. */
export const PAGE_AUDIO_COLUMNS: Array<[column: string, type: string]> = [
  ['page_audio_enabled', 'integer DEFAULT false'],
  ['page_audio_source_type', "text DEFAULT 'upload'"],
  ['page_audio_media_id', 'integer'],
  ['page_audio_url', 'text'],
  ['page_audio_loop', 'integer DEFAULT true'],
  ['page_audio_volume', 'numeric DEFAULT 80'],
  ['page_audio_start_muted', 'integer DEFAULT true'],
  ['page_audio_show_controls', 'integer DEFAULT true'],
  ['page_audio_start_on_first_interaction', 'integer DEFAULT true'],
  ['page_audio_respect_reduced_data', 'integer DEFAULT true'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [table, prefix] of [
    ['eg_pages', ''],
    ['_eg_pages_v', 'version_'],
  ] as const) {
    if (!(await tableExists(db, table))) continue
    for (const [column, type] of PAGE_AUDIO_COLUMNS) {
      const name = `${prefix}${column}`
      if (!(await columnExists(db, table, name))) {
        await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`))
      }
    }
  }
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; left in place.
}
