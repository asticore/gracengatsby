import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Tracking events: the eg_tracking_events table, the TikTok pixel group on the Integrations row, and an on/off switch for the
// Meta pixel. Every statement is idempotent: CREATE ... IF NOT EXISTS, and ADD COLUMN tolerates "duplicate column name".
// The Meta switch defaults to on, so a site with a pixel ID keeps sending events exactly as before. Registered last in
// src/migrations/index.ts.

type Runner = MigrateUpArgs['db']

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

const CREATE_EVENTS = `CREATE TABLE IF NOT EXISTS \`eg_tracking_events\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`platform_event\` text DEFAULT 'Custom' NOT NULL,
  \`trigger_type\` text DEFAULT 'click' NOT NULL,
  \`selector\` text,
  \`selector_text\` text,
  \`url_match_mode\` text DEFAULT 'any',
  \`url_match\` text,
  \`domain\` text,
  \`scroll_depth\` numeric DEFAULT 50,
  \`time_seconds\` numeric DEFAULT 30,
  \`value\` numeric,
  \`currency\` text,
  \`content_name\` text,
  \`enabled\` integer DEFAULT true,
  \`updated_at\` text DEFAULT ${NOW} NOT NULL,
  \`created_at\` text DEFAULT ${NOW} NOT NULL
)`

const INTEGRATION_COLUMNS: Array<[column: string, type: string]> = [
  ['tiktok_pixel_enabled', 'integer DEFAULT 1'],
  ['tiktok_pixel_pixel_id', 'text'],
  ['meta_pixel_enabled', 'integer DEFAULT 1'],
]

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
  await db.run(sql.raw(CREATE_EVENTS))
  // A fresh install has no Integrations row until the global is saved, and the columns are added when the table exists.
  if (await tableExists(db, 'eg_integrations')) {
    for (const [column, type] of INTEGRATION_COLUMNS) await addColumn(db, 'eg_integrations', column, type)
  }
  // The feature switch (defaultEnabled in features/registry.ts) lives on the site settings row, as features_<key>.
  if (await tableExists(db, 'eg_site_settings')) {
    await addColumn(db, 'eg_site_settings', 'features_tracking', 'integer DEFAULT true')
  }
  engine.logger.info('[migrate] Tracking events table and tag connection columns are in place.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the tracking table and columns are left in place.')
}
