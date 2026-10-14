import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Adds the `seo.focusKeyphrase` text column to every collection that uses the
// shared SEO group (pages, posts, products, events, courses), and to each of
// their version tables (version_ prefix). The Analysis tab in the SEO card reads
// this value to check the content against one search phrase.
//
// Replayable: each column is only added when PRAGMA table_info shows it missing,
// and a table that does not exist yet is skipped rather than failing the chain.

const LIVE_TABLES = ['eg_pages', 'eg_posts', 'eg_products', 'eg_events', 'eg_courses']
const VERSION_TABLES = ['_eg_pages_v', '_eg_posts_v', '_eg_products_v', '_eg_events_v', '_eg_courses_v']

const COLUMN = 'seo_focus_keyphrase'
const VERSION_COLUMN = 'version_seo_focus_keyphrase'

type Runner = MigrateUpArgs['db']

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const exists = async (table: string): Promise<boolean> => {
    const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as { name: string }[]
    return rows.length > 0
  }

  const columnsOf = async (table: string): Promise<string[]> => {
    const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
    return rows.map((row) => row.name)
  }

  const addIfMissing = async (db: Runner, table: string, column: string): Promise<boolean> => {
    if (!(await exists(table))) return false
    if ((await columnsOf(table)).includes(column)) return false
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${column}\` text`))
    return true
  }

  const added: string[] = []
  for (const table of LIVE_TABLES) {
    if (await addIfMissing(db, table, COLUMN)) added.push(table)
  }
  for (const table of VERSION_TABLES) {
    if (await addIfMissing(db, table, VERSION_COLUMN)) added.push(table)
  }

  if (added.length > 0) {
    engine.logger.info(`[migrate] Added SEO focus keyphrase column to: ${added.join(', ')}`)
  }
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // No-op, matching the other SEO migrations. Dropping the columns would delete
  // keyphrases that editors have already written.
  engine.logger.info('[migrate] Down is a no-op - the SEO focus keyphrase columns are left in place.')
}
