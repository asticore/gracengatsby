import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Site details (table eg_site_details, global `site-details`): time zone, date and clock formats, and the
// business group. Idempotent: CREATE TABLE IF NOT EXISTS only. Column names mirror src/cms/db/schema/generate.ts
// for src/globals/SiteDetails.ts, where the business group's columns are the group name plus the field name.
// No row is inserted: a missing row or value means the defaults in src/features/site/detailsModel.ts.

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `eg_site_details` ( `id` integer PRIMARY KEY NOT NULL, `timezone` text DEFAULT 'Australia/Sydney', `date_format` text DEFAULT 'long', `time_format` text DEFAULT '12h', `business_business_name` text, `business_legal_name` text, `business_abn` text, `business_phone` text, `business_email` text, `business_website` text, `business_street_address` text, `business_suburb` text, `business_state` text, `business_postcode` text, `business_country` text DEFAULT 'Australia', `business_opening_hours` text, `updated_at` text, `created_at` text )",
    ),
  )
  engine.logger.info('[migrate] Site details table ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the site details table is left in place.')
}
