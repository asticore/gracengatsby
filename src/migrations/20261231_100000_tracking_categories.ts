import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Consent category per pixel on the Integrations row: which cookie category the visitor must accept before the Meta or
// TikTok pixel loads. Defaults to marketing, the same as before this column existed. Idempotent (ADD COLUMN tolerates
// "duplicate column name"). Registered last in src/migrations/index.ts.

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
    await addColumn(db, 'eg_integrations', 'meta_pixel_consent_category', "text DEFAULT 'marketing'")
    await addColumn(db, 'eg_integrations', 'tiktok_pixel_consent_category', "text DEFAULT 'marketing'")
  }
  engine.logger.info('[migrate] Meta and TikTok consent category columns are in place.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the category columns are left in place.')
}
