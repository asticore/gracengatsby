import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// On/off switches for GA4 and Google Tag Manager on the Integrations row (google group). Columns default to on, so a
// site with IDs keeps sending exactly as before. Idempotent: ADD COLUMN tolerates "duplicate column name". Registered
// last in src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

const tableExists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${table}`)) as unknown[]).length > 0

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  if (await tableExists(db, 'eg_integrations')) {
    await addColumn(db, 'eg_integrations', 'google_ga4_enabled', 'integer DEFAULT 1')
    await addColumn(db, 'eg_integrations', 'google_gtm_enabled', 'integer DEFAULT 1')
  }
  engine.logger.info('[migrate] GA4 and Tag Manager switches are in place.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the switch columns are left in place.')
}
