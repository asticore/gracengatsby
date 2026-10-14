import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Line-item refunds: `lines` (JSON: which order lines a refund covers, how much of each, and whether
// they were restocked) and `shipping_amount` (shipping refunded, in cents) on eg_order_refunds.
// Column names mirror src/cms/db/schema/generate.ts for the fields in
// src/features/ecommerce/collections/OrderRefunds.ts. Idempotent: a column is only added when
// PRAGMA table_info says it is missing.

const COLUMNS: [string, string][] = [
  ['lines', 'text'],
  ['shipping_amount', 'numeric'],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const have = new Set(((await db.all(sql.raw('PRAGMA table_info(`eg_order_refunds`)'))) as { name: string }[]).map((r) => r.name))
  if (have.size === 0) return
  for (const [column, type] of COLUMNS) {
    if (have.has(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`eg_order_refunds\` ADD COLUMN \`${column}\` ${type}`))
  }
  engine.logger.info('[migrate] order refund line columns ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the refund line columns are left in place.')
}
