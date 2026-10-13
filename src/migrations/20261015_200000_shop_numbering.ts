import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Order and invoice number counters. One row per counter key ('order', 'invoice'); the number
// allocator in src/features/ecommerce/numbering.ts raises last_value with a single atomic
// UPDATE ... RETURNING, so two concurrent orders can never be handed the same number.
// Idempotent: the table is CREATE TABLE IF NOT EXISTS and the index likewise.

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `eg_number_counters` (\n  `key` text PRIMARY KEY NOT NULL,\n  `last_value` numeric NOT NULL,\n  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL\n)",
    ),
  )
  engine.logger.info('[migrate] order and invoice number counters ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the number counters are left in place so numbers are never reused.')
}
