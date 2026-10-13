import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Wave 10: repeat rules on events (weekdays, monthly repeat style, number of dates), the link from a
// generated date back to its series (series_of_id), and the ticket type an RSVP was made for.
//
// Written by hand like the other migrations here: every statement is safe to replay (a column is added
// only when PRAGMA table_info does not list it, and a table that does not exist yet is skipped). Column
// names are what src/cms/db/schema/generate.ts produces for the fields in src/features/editScreens/fields.ts.
// Change one, change both. Events are versioned, so each new event column also gets a `version_` copy on
// its versions table `_eg_events_v`.

type Runner = MigrateUpArgs['db']

type Columns = Array<[string, string]>

const EVENTS: Columns = [
  ['recurrence_weekdays', 'text'],
  ['recurrence_monthly_by', "text DEFAULT 'dayOfMonth'"],
  ['recurrence_count', 'numeric'],
  ['series_of_id', 'integer'],
]

const RSVPS: Columns = [['ticket_tier', 'text']]

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

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await addMissingColumns(db, 'eg_events', EVENTS)
  await addMissingColumns(
    db,
    '_eg_events_v',
    EVENTS.map(([column, type]) => [`version_${column}`, type] as [string, string]),
  )
  await addMissingColumns(db, 'eg_event_rsvps', RSVPS)

  engine.logger.info('[migrate] wave 10 columns (repeat weekdays, monthly style, number of dates, series link, RSVP ticket type) ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply and the data is worth keeping, so down is a no-op.
}
