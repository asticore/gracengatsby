import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Theme styles (Theme styles admin view): the site's global colours, text, button and table styles
// as one JSON document in row id 1. Written and read with raw SQL (src/features/themeStyles/store.ts),
// so the table is not in the drizzle schema. Idempotent: CREATE ... IF NOT EXISTS.

const TABLE = 'CREATE TABLE IF NOT EXISTS `eg_theme_styles` (`id` integer PRIMARY KEY NOT NULL, `data` text NOT NULL, `updated_at` text)'

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))
  engine.logger.info('[migrate] eg_theme_styles is present.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - eg_theme_styles is left in place.')
}