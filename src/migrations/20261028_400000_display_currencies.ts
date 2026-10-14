import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Extra display currencies for the storefront (Shop settings > Display currencies). One row per
// currency. Prices are converted for DISPLAY only; checkout always charges the base shop currency.
// `rate_mode` says whether `manual_rate` or the daily `auto_rate` (fetched by the hourly cron job,
// see src/features/ecommerce/server/displayRates.ts) is used. Written and read with raw SQL, so the
// table is not in the drizzle schema. Idempotent: CREATE ... IF NOT EXISTS throughout.

const TABLE = `CREATE TABLE IF NOT EXISTS \`eg_shop_display_currencies\` (
  \`code\` text PRIMARY KEY NOT NULL,
  \`enabled\` integer DEFAULT 1 NOT NULL,
  \`sort_order\` integer DEFAULT 0 NOT NULL,
  \`rate_mode\` text DEFAULT 'manual' NOT NULL,
  \`manual_rate\` numeric,
  \`auto_rate\` numeric,
  \`auto_rate_base\` text,
  \`auto_rate_at\` text,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const INDEX = 'CREATE INDEX IF NOT EXISTS `eg_shop_display_currencies_sort_idx` ON `eg_shop_display_currencies` (`sort_order`)'

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))
  await db.run(sql.raw(INDEX))
  engine.logger.info('[migrate] eg_shop_display_currencies is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - eg_shop_display_currencies is left in place.')
}
