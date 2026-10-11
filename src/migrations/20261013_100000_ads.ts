import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Ads: ad units, placements, the settings global, the raw daily counter table, the feature
// flag column and the per-document "No ads" switch. Idempotent: every statement can be replayed.

type Runner = MigrateUpArgs['db']

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

const TABLES = [
  `CREATE TABLE IF NOT EXISTS \`eg_ad_units\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`key\` text NOT NULL,
  \`network\` text DEFAULT 'gam' NOT NULL,
  \`enabled\` integer DEFAULT true,
  \`slot_id\` text,
  \`adsense_responsive\` integer DEFAULT true,
  \`gam_path\` text,
  \`sizes_mobile\` text,
  \`sizes_tablet\` text,
  \`sizes_desktop\` text,
  \`floor_price\` numeric,
  \`lazy_load\` integer DEFAULT true,
  \`refresh_enabled\` integer DEFAULT false,
  \`refresh_seconds\` numeric DEFAULT 60,
  \`refresh_max\` numeric DEFAULT 10,
  \`refresh_require_viewable\` integer DEFAULT true,
  \`targeting\` text,
  \`prebid\` integer DEFAULT false,
  \`bidder_params\` text,
  \`updated_at\` text DEFAULT ${NOW} NOT NULL,
  \`created_at\` text DEFAULT ${NOW} NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_ad_placements\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`key\` text NOT NULL,
  \`unit_id\` integer NOT NULL,
  \`mode\` text DEFAULT 'manual' NOT NULL,
  \`enabled\` integer DEFAULT true,
  \`after_paragraph\` numeric DEFAULT 3,
  \`repeat_every\` numeric DEFAULT 0,
  \`feed_every\` numeric DEFAULT 6,
  \`max_per_page\` numeric DEFAULT 3,
  \`on_pages\` integer DEFAULT true,
  \`on_posts\` integer DEFAULT true,
  \`on_products\` integer DEFAULT true,
  \`updated_at\` text DEFAULT ${NOW} NOT NULL,
  \`created_at\` text DEFAULT ${NOW} NOT NULL,
  FOREIGN KEY (\`unit_id\`) REFERENCES \`eg_ad_units\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
  `CREATE TABLE IF NOT EXISTS \`eg_ad_settings\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`general_show_label\` integer DEFAULT true,
  \`general_label\` text DEFAULT 'Advertisement',
  \`adsense_enabled\` integer DEFAULT false,
  \`adsense_publisher_id\` text,
  \`adsense_auto_ads\` integer DEFAULT false,
  \`gam_enabled\` integer DEFAULT false,
  \`gam_network_code\` text,
  \`gam_publisher_id\` text,
  \`gam_single_request\` integer DEFAULT true,
  \`prebid_enabled\` integer DEFAULT false,
  \`prebid_script_url\` text,
  \`prebid_timeout_ms\` numeric DEFAULT 1000,
  \`prebid_failsafe_ms\` numeric DEFAULT 3000,
  \`prebid_price_granularity\` text DEFAULT 'medium',
  \`prebid_user_sync\` integer DEFAULT true,
  \`prebid_user_sync_delay_ms\` numeric DEFAULT 3000,
  \`prebid_bidders\` text,
  \`privacy_gdpr_mode\` text DEFAULT 'region',
  \`privacy_tcf_timeout_ms\` numeric DEFAULT 1500,
  \`ads_txt_generate\` integer DEFAULT true,
  \`updated_at\` text DEFAULT ${NOW} NOT NULL,
  \`created_at\` text DEFAULT ${NOW} NOT NULL
)`,
  // Own counter: viewable impressions (and clicks, where we can see them) per unit per day per breakpoint.
  `CREATE TABLE IF NOT EXISTS \`eg_ad_stats\` (
  \`unit_key\` text NOT NULL,
  \`day\` text NOT NULL,
  \`bp\` text NOT NULL,
  \`impressions\` integer DEFAULT 0 NOT NULL,
  \`clicks\` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (\`unit_key\`, \`day\`, \`bp\`)
)`,
]

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_ad_units_key_idx` ON `eg_ad_units` (`key`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_ad_placements_key_idx` ON `eg_ad_placements` (`key`)',
  'CREATE INDEX IF NOT EXISTS `eg_ad_placements_unit_idx` ON `eg_ad_placements` (`unit_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_ad_stats_day_idx` ON `eg_ad_stats` (`day`)',
]

const exists = async (db: Runner, table: string): Promise<boolean> =>
  ((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as unknown[]).length > 0

const addMissing = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  if (!(await exists(db, table))) return
  const cols = new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))
  if (!cols.has(column)) await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))

  // Feature flag, off by default.
  await addMissing(db, 'eg_site_settings', 'features_ads', 'integer DEFAULT false')

  // Per-document "No ads" switch on pages, posts and products (and their version tables).
  for (const live of ['eg_pages', 'eg_posts', 'eg_products']) {
    await addMissing(db, live, 'no_ads', 'integer DEFAULT false')
    await addMissing(db, `_${live}_v`, 'version_no_ads', 'integer DEFAULT false')
  }

  // Document locking needs a join column per registered collection.
  for (const name of ['eg_ad_units_id', 'eg_ad_placements_id']) {
    await addMissing(db, 'eg_locked_documents_rels', name, 'integer')
    if (await exists(db, 'eg_locked_documents_rels')) {
      await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`eg_locked_documents_rels_${name}_idx\` ON \`eg_locked_documents_rels\` (\`${name}\`)`))
    }
  }
  engine.logger.info('[migrate] ads tables, flag and No ads columns ensured.')
}

export async function down(_args: MigrateDownArgs): Promise<void> {}
