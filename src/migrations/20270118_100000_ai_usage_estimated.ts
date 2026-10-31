import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

/**
 * Build with AI usage: stores whether a call's token counts were an estimate (the provider sent none)
 * in `ai_builder_usage.estimated`. Before this column the flag was returned in the API response only.
 *
 * Idempotent: the column is only added when missing.
 */
export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const rows = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='ai_builder_usage'`)) as { name: string }[]
  if (rows.length > 0) {
    try {
      await db.run(sql.raw('ALTER TABLE `ai_builder_usage` ADD COLUMN `estimated` integer DEFAULT 0 NOT NULL'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/duplicate column name/i.test(message)) throw error
    }
  }
  engine.logger.info('[migrate] AI builder usage records whether token counts were estimated.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the estimated column is left in place.')
}
