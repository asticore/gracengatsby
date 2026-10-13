import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Back-in-stock sign-ups: one row per person who asked to hear when an item is back in stock.
// Idempotent: the table is CREATE ... IF NOT EXISTS, the lock-document link column is only added when
// PRAGMA table_info says it is missing. Column names mirror src/cms/db/schema/generate.ts for the
// collection config StockSubscriptions under src/features/ecommerce/collections.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const TABLE = `CREATE TABLE IF NOT EXISTS \`eg_stock_subscriptions\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`product_id\` integer NOT NULL,
  \`variation\` text,
  \`email\` text NOT NULL,
  \`status\` text DEFAULT 'pending',
  \`notified_at\` text,
${TS}
)`

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_stock_subscriptions_product_idx` ON `eg_stock_subscriptions` (`product_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_stock_subscriptions_status_idx` ON `eg_stock_subscriptions` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_stock_subscriptions_created_at_idx` ON `eg_stock_subscriptions` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_stock_subscriptions_id_idx` ON `eg_locked_documents_rels` (`eg_stock_subscriptions_id`)',
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))
  const locked = await columnsOf(db, 'eg_locked_documents_rels')
  if (locked.size > 0 && !locked.has('eg_stock_subscriptions_id')) {
    await db.run(sql.raw('ALTER TABLE `eg_locked_documents_rels` ADD COLUMN `eg_stock_subscriptions_id` integer'))
  }
  for (const statement of INDEXES) {
    const table = /ON `([^`]+)`/.exec(statement)?.[1]
    if (table && (await columnsOf(db, table)).size === 0) continue
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] back-in-stock sign-up table ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the back-in-stock sign-up table is left in place.')
}