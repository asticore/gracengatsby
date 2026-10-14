import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Product subscriptions (wave 19, agent C): the `product-subscriptions` table, one JSON `subscription` plan column
// on each product (and its version copy), the Subscriptions shop switch and the four subscription email switches.
// Column names mirror src/cms/db/schema/generate.ts for src/features/ecommerce/collections/ProductSubscriptions.ts,
// src/features/ecommerce/subscriptions/fields.ts, src/globals/ShopExtraSettings.ts and src/globals/EmailSchedule.ts.
// Idempotent: the table is CREATE TABLE IF NOT EXISTS, every column is added only when PRAGMA table_info says it is
// missing (and the table exists), and the indexes are created IF NOT EXISTS.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const TABLE = `CREATE TABLE IF NOT EXISTS \`eg_product_subscriptions\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`customer_id\` integer,
  \`customer_email\` text,
  \`product_id\` integer NOT NULL,
  \`product_name\` text,
  \`status\` text DEFAULT 'incomplete',
  \`amount_cents\` numeric,
  \`currency\` text,
  \`payments_made\` numeric DEFAULT 0,
  \`billing_interval\` text,
  \`billing_interval_count\` numeric,
  \`payments_limit\` numeric,
  \`started_at\` text,
  \`trial_ends_at\` text,
  \`next_payment_at\` text,
  \`cancelled_at\` text,
  \`ended_at\` text,
  \`stripe_customer_id\` text,
  \`stripe_subscription_id\` text,
  \`stripe_price_id\` text,
  \`history\` text,
${TS}
)`

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_customer_idx` ON `eg_product_subscriptions` (`customer_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_customer_email_idx` ON `eg_product_subscriptions` (`customer_email`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_product_idx` ON `eg_product_subscriptions` (`product_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_status_idx` ON `eg_product_subscriptions` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_stripe_subscription_id_idx` ON `eg_product_subscriptions` (`stripe_subscription_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_subscriptions_created_at_idx` ON `eg_product_subscriptions` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_product_subscriptions_id_idx` ON `eg_locked_documents_rels` (`eg_product_subscriptions_id`)',
]

/** Columns added to tables that already exist. Each one is skipped when the table or the column is missing. */
const ADDITIONS: [table: string, column: string, type: string][] = [
  ['eg_locked_documents_rels', 'eg_product_subscriptions_id', 'integer'],
  ['eg_products', 'subscription', 'text'],
  ['_eg_products_v', 'version_subscription', 'text'],
  ['eg_shop_extra_settings', 'subscriptions_enabled', 'integer DEFAULT false'],
  ['eg_email_schedule', 'subscription_new_enabled', 'integer'],
  ['eg_email_schedule', 'subscription_renewal_enabled', 'integer'],
  ['eg_email_schedule', 'subscription_failed_enabled', 'integer'],
  ['eg_email_schedule', 'subscription_cancelled_enabled', 'integer'],
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(TABLE))
  for (const [table, column, type] of ADDITIONS) {
    const have = await columnsOf(db, table)
    if (have.size === 0 || have.has(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  }
  for (const statement of INDEXES) {
    const table = /ON `([^`]+)`/.exec(statement)?.[1]
    if (table && (await columnsOf(db, table)).size === 0) continue
    await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] product subscription table, plan column and switches ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the subscription table and columns are left in place.')
}
