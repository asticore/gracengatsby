import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Event value sources on eg_tracking_events: where the value sent with an event comes from (none, a fixed amount, the
// cart total, a product or order price, the quantity, an element's text or attribute, or a data layer variable), the
// attribute or data layer name it reads, and the optional selector of the element to read. Existing rows get
// value_source 'none', which sends nothing new. Idempotent: ADD COLUMN tolerates "duplicate column name". Registered
// last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    // D1 wraps the driver error: the "duplicate column name" text sits on error.cause, not on the outer message.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    const message = `${error instanceof Error ? error.message : String(error)} ${cause}`
    if (!/duplicate column name/i.test(message)) throw error
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as unknown[]).length > 0

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (await tableExists(db, 'eg_tracking_events')) {
    await addColumn(db, 'eg_tracking_events', 'value_source', "text DEFAULT 'none'")
    await addColumn(db, 'eg_tracking_events', 'value_ref', 'text')
    await addColumn(db, 'eg_tracking_events', 'value_selector', 'text')
  }
  engine.logger.info('[migrate] Tracking event value source columns are in place.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the value source columns are left in place.')
}
