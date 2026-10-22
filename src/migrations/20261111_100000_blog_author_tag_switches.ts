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

const addColumn = async (db: Runner, table: string, column: string, def: number): Promise<void> => {
  if (!(await tableExists(db, table))) return
  if (await columnExists(db, table, column)) return
  await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` integer DEFAULT ${def}`))
}

/** Blog author/tag switches (global, default on) and the per-post hide-author flag (default off). Idempotent. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumn(db, 'eg_blog_settings', 'show_authors', 1)
  await addColumn(db, 'eg_blog_settings', 'show_tags', 1)
  await addColumn(db, 'eg_blog_settings', 'author_archives', 1)
  await addColumn(db, 'eg_posts', 'hide_author', 0)
  await addColumn(db, '_eg_posts_v', 'version_hide_author', 0)
}

export async function down(): Promise<void> {
  // SQLite cannot drop columns cheaply; left in place.
}
