import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Gift cards, store credit and the credit ledger, plus the order and cart columns that carry them.
// Idempotent: tables are CREATE ... IF NOT EXISTS and columns are only added when PRAGMA table_info
// says they are missing. Column names mirror src/cms/db/schema/generate.ts for the collection configs
// GiftCards, StoreCredits and CreditLedger under src/features/ecommerce/collections.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const create = (name: string, cols: string[]): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`id\` integer PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')},\n${TS}\n)`

const TABLES: string[] = [
  create('eg_gift_cards', [
    '`code` text',
    '`initial_amount` numeric NOT NULL',
    '`balance` numeric DEFAULT 0',
    "`currency` text DEFAULT 'AUD'",
    "`status` text DEFAULT 'active'",
    '`expires_at` text',
    '`recipient_name` text',
    '`recipient_email` text',
    '`sender_name` text',
    '`message` text',
    '`send_at` text',
    '`sent_at` text',
    '`purchaser_email` text',
    '`order_id` integer',
    '`restrict_product_id` integer',
    '`note` text',
  ]),
  create('eg_store_credits', ['`user_id` integer NOT NULL', '`balance` numeric DEFAULT 0']),
  create('eg_credit_ledger', [
    '`kind` text NOT NULL',
    '`direction` text NOT NULL',
    '`amount` numeric NOT NULL',
    '`balance_after` numeric',
    '`reason` text',
    '`gift_card_id` integer',
    '`user_id` integer',
    '`order_id` integer',
    '`created_by_id` integer',
  ]),
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_orders: [
    ['order_number', 'text'],
    ['invoice_number', 'text'],
    ['gift_card_total', 'numeric DEFAULT 0'],
    ['store_credit_total', 'numeric DEFAULT 0'],
    ['stored_value', 'text'],
    ['stored_value_applied', 'integer DEFAULT false'],
    ['gift_cards_issued', 'integer DEFAULT false'],
  ],
  eg_carts_items: [
    ['custom_amount', 'numeric'],
    ['gift_name', 'text'],
    ['gift_email', 'text'],
    ['gift_sender_name', 'text'],
    ['gift_message', 'text'],
    ['gift_send_at', 'text'],
  ],
  eg_locked_documents_rels: ['gift_cards', 'store_credits', 'credit_ledger'].map((n): [string, string] => [`eg_${n}_id`, 'integer']),
}

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_gift_cards_code_idx` ON `eg_gift_cards` (`code`)',
  'CREATE INDEX IF NOT EXISTS `eg_gift_cards_status_idx` ON `eg_gift_cards` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_gift_cards_created_at_idx` ON `eg_gift_cards` (`created_at`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_store_credits_user_idx` ON `eg_store_credits` (`user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_store_credits_created_at_idx` ON `eg_store_credits` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_credit_ledger_kind_idx` ON `eg_credit_ledger` (`kind`)',
  'CREATE INDEX IF NOT EXISTS `eg_credit_ledger_gift_card_idx` ON `eg_credit_ledger` (`gift_card_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_credit_ledger_user_idx` ON `eg_credit_ledger` (`user_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_credit_ledger_created_at_idx` ON `eg_credit_ledger` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_orders_order_number_idx` ON `eg_orders` (`order_number`)',
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const have = await columnsOf(db, table)
    if (have.size === 0) continue
    for (const [column, type] of cols) {
      if (have.has(column)) continue
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
  for (const statement of INDEXES) {
    const table = /ON `([^`]+)`/.exec(statement)?.[1]
    if (table && (await columnsOf(db, table)).size === 0) continue
    await db.run(sql.raw(statement))
  }
  if ((await columnsOf(db, 'eg_locked_documents_rels')).size > 0) {
    for (const n of ['gift_cards', 'store_credits', 'credit_ledger']) {
      await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`eg_locked_documents_rels_eg_${n}_id_idx\` ON \`eg_locked_documents_rels\` (\`eg_${n}_id\`)`))
    }
  }
  engine.logger.info('[migrate] gift cards, store credit and ledger tables ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the stored value tables are left in place.')
}
