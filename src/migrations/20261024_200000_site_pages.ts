import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Special pages and maintenance mode (table eg_site_pages, global `site-pages`, src/globals/SitePages.ts).
// Idempotent: CREATE TABLE IF NOT EXISTS, so a fresh install and an already-migrated site both end up with the
// same table. Column names mirror src/cms/db/schema/generate.ts: relationships become `<name>_id`, and the
// maintenance group prefixes its fields with `maintenance_`.
// The table has no foreign keys on purpose: a deleted page just leaves a dangling id, which the loader treats as
// "no page chosen".

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `eg_site_pages` ( `id` integer PRIMARY KEY NOT NULL, `not_found_page_id` integer, `privacy_policy_page_id` integer, `terms_page_id` integer, `maintenance_enabled` integer DEFAULT false, `maintenance_headline` text DEFAULT 'We''ll be back soon', `maintenance_message` text, `maintenance_bypass_token` text, `maintenance_allow_admins` integer DEFAULT true, `updated_at` text, `created_at` text )",
    ),
  )
  engine.logger.info('[migrate] Site pages and maintenance settings ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the site pages table is left in place.')
}
