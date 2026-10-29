import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Regional domains (src/globals/DomainSettings.ts, global `domain-settings`).
// Tables: eg_domain_settings (the one-row global) and eg_domain_settings_domains (its `domains` array, one row per domain).
// Column names mirror src/cms/db/schema/generate.ts: camelCase fields become snake_case, and the array child table
// follows the same shape as eg_shop_extra_settings_pricing_rules (_order, _parent_id, id, then the fields).
// Idempotent: CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS, so a fresh install and an
// already-migrated site both end with the same tables. Registered last in src/migrations/index.ts.

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      'CREATE TABLE IF NOT EXISTS `eg_domain_settings` ( `id` integer PRIMARY KEY NOT NULL, `updated_at` text, `created_at` text )',
    ),
  )
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `eg_domain_settings_domains` ( `_order` integer NOT NULL, `_parent_id` integer NOT NULL, `id` text PRIMARY KEY NOT NULL, `host` text, `label` text, `default_locale` text, `currency_hint` text, `is_primary` integer DEFAULT false, `status` text DEFAULT 'active', `redirect_to_primary` integer DEFAULT false, `allow_admin` integer DEFAULT true, FOREIGN KEY (`_parent_id`) REFERENCES `eg_domain_settings`(`id`) ON UPDATE no action ON DELETE cascade )",
    ),
  )
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_domain_settings_domains_order_idx` ON `eg_domain_settings_domains` (`_order`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_domain_settings_domains_parent_id_idx` ON `eg_domain_settings_domains` (`_parent_id`)'))
  engine.logger.info('[migrate] Regional domain registry tables are present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the domain registry tables are left in place.')
}
