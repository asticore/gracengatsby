import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Edit screens audit: trash (soft delete) on pages, posts and events; featured image and excerpt on
// pages; sticky posts and reading time on posts; recurring events and ticket tiers on events; check-in
// on event RSVPs.
//
// Written by hand like the other migrations here: every statement is safe to replay (columns are added
// only when PRAGMA table_info does not list them, tables that do not exist yet are skipped). Column names
// are what src/cms/db/schema/generate.ts produces for the fields in src/features/editScreens/fields.ts.
// Change one, change both. Each live table also has a versions table `_<table>_v` whose columns carry the
// `version_` prefix.

type Runner = MigrateUpArgs['db']

type Columns = Array<[string, string]>

const PAGES: Columns = [
  ['trashed_at', 'text'],
  ['excerpt', 'text'],
  ['featured_image_id', 'integer'],
]

const POSTS: Columns = [
  ['trashed_at', 'text'],
  ['sticky', 'integer DEFAULT false'],
  ['reading_time', 'numeric'],
]

const EVENTS: Columns = [
  ['trashed_at', 'text'],
  ['recurrence_frequency', "text DEFAULT 'none'"],
  ['recurrence_interval', 'numeric DEFAULT 1'],
  ['recurrence_until', 'text'],
  ['recurrence_exceptions', 'text'],
  ['ticket_tiers', 'text'],
]

const RSVPS: Columns = [
  ['checked_in', 'integer DEFAULT false'],
  ['checked_in_at', 'text'],
]

const columnNames = async (db: Runner, table: string): Promise<Set<string>> => {
  const rows = (await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]
  return new Set(rows.map((row) => row.name))
}

/** Adds each column that is missing. A table that is not there is skipped. */
const addMissingColumns = async (db: Runner, table: string, columns: Columns): Promise<void> => {
  const existing = await columnNames(db, table)
  if (existing.size === 0) return
  for (const [column, type] of columns) {
    if (!existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
}

/** The live table and its versions table. */
const addToLiveAndVersions = async (db: Runner, live: string, columns: Columns): Promise<void> => {
  await addMissingColumns(db, live, columns)
  await addMissingColumns(
    db,
    `_${live}_v`,
    columns.map(([column, type]) => [`version_${column}`, type] as [string, string]),
  )
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addToLiveAndVersions(db, 'eg_pages', PAGES)
  await addToLiveAndVersions(db, 'eg_posts', POSTS)
  await addToLiveAndVersions(db, 'eg_events', EVENTS)
  await addMissingColumns(db, 'eg_event_rsvps', RSVPS)

  engine.logger.info('[migrate] edit screens columns (trash, excerpt, sticky, reading time, recurrence, tiers, check-in) ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply and the data is worth keeping, so down is a no-op.
}
