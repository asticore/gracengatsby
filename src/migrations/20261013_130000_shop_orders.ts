import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shop orders, shipping, tax, coupons, refunds, checkout fields and abandoned carts.
// Every statement is replayable: CREATE ... IF NOT EXISTS, and column adds swallow only
// the duplicate-column error. Column names mirror what src/cms/db/schema/generate.ts
// produces for the collection configs under src/features/ecommerce/collections.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const create = (name: string, cols: string[], tail = ''): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`id\` integer PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')},\n${TS}${tail}\n)`

const child = (name: string, parent: string, parentType: 'integer' | 'text', cols: string[]): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`_order\` integer NOT NULL,\n  \`_parent_id\` ${parentType} NOT NULL,\n  \`id\` text PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')},\n  FOREIGN KEY (\`_parent_id\`) REFERENCES \`${parent}\`(\`id\`) ON UPDATE no action ON DELETE cascade\n)`

const TABLES: string[] = [
  create('eg_shipping_zones', ['`name` text NOT NULL', '`order` numeric']),
  child('eg_shipping_zones_regions', 'eg_shipping_zones', 'integer', ['`type` text NOT NULL', '`country` text NOT NULL', '`value` text']),
  child('eg_shipping_zones_methods', 'eg_shipping_zones', 'integer', [
    '`type` text NOT NULL',
    '`title` text NOT NULL',
    '`cost` numeric',
    '`taxable` integer',
    '`free_over` numeric',
    '`table_basis` text',
    '`enabled` integer',
  ]),
  child('eg_shipping_zones_methods_table_rates', 'eg_shipping_zones_methods', 'text', ['`min` numeric', '`max` numeric', '`cost` numeric NOT NULL']),
  child('eg_shipping_zones_methods_class_surcharges', 'eg_shipping_zones_methods', 'text', ['`shipping_class` text NOT NULL', '`cost` numeric NOT NULL']),
  create('eg_tax_rates', [
    '`name` text NOT NULL',
    '`tax_class` text NOT NULL',
    '`country` text',
    '`state` text',
    '`rate_pct` numeric NOT NULL',
    '`shipping_taxable` integer',
    '`priority` numeric',
  ]),
  create('eg_coupons', [
    '`code` text NOT NULL',
    '`description` text',
    '`type` text NOT NULL',
    '`amount` numeric',
    '`enabled` integer',
    '`expires_at` text',
    '`min_spend` numeric',
    '`max_spend` numeric',
    '`usage_limit` numeric',
    '`usage_limit_per_user` numeric',
    '`usage_count` numeric',
    '`individual_use` integer',
    '`exclude_sale_items` integer',
    '`include_products` text',
    '`exclude_products` text',
    '`include_categories` text',
    '`exclude_categories` text',
  ]),
  create('eg_order_refunds', [
    '`order_id` integer NOT NULL',
    '`amount` numeric NOT NULL',
    '`reason` text',
    '`items` text',
    '`restock` integer',
    '`method` text',
    '`status` text',
    '`provider_refund_id` text',
    '`created_by_id` integer',
  ]),
  child('eg_shop_settings_checkout_fields', 'eg_shop_settings', 'integer', [
    '`key` text NOT NULL',
    '`label` text',
    '`type` text',
    '`enabled` integer',
    '`required` integer',
    '`placeholder` text',
  ]),
]

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_created_at_idx` ON `eg_shipping_zones` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_regions_order_idx` ON `eg_shipping_zones_regions` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_regions_parent_id_idx` ON `eg_shipping_zones_regions` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_order_idx` ON `eg_shipping_zones_methods` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_parent_id_idx` ON `eg_shipping_zones_methods` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_table_rates_order_idx` ON `eg_shipping_zones_methods_table_rates` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_table_rates_parent_id_idx` ON `eg_shipping_zones_methods_table_rates` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_class_surcharges_order_idx` ON `eg_shipping_zones_methods_class_surcharges` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_zones_methods_class_surcharges_parent_id_idx` ON `eg_shipping_zones_methods_class_surcharges` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_tax_rates_created_at_idx` ON `eg_tax_rates` (`created_at`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_coupons_code_idx` ON `eg_coupons` (`code`)',
  'CREATE INDEX IF NOT EXISTS `eg_coupons_created_at_idx` ON `eg_coupons` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_order_refunds_order_idx` ON `eg_order_refunds` (`order_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_order_refunds_created_at_idx` ON `eg_order_refunds` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_shop_settings_checkout_fields_order_idx` ON `eg_shop_settings_checkout_fields` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shop_settings_checkout_fields_parent_id_idx` ON `eg_shop_settings_checkout_fields` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_orders_payment_intent_id_idx` ON `eg_orders` (`payment_intent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_orders_cart_id_idx` ON `eg_orders` (`cart_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_carts_email_idx` ON `eg_carts` (`email`)',
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_orders: [
    ['subtotal', 'numeric'],
    ['discount_total', 'numeric'],
    ['shipping_total', 'numeric'],
    ['tax_total', 'numeric'],
    ['refunded_total', 'numeric DEFAULT 0'],
    ['prices_include_tax', 'integer DEFAULT true'],
    ['shipping_method', 'text'],
    ['tax_lines', 'text'],
    ['coupon_lines', 'text'],
    ['line_items', 'text'],
    ['checkout_fields', 'text'],
    ['customer_note', 'text'],
    ['paid_at', 'text'],
    ['notes', 'text'],
    ['payment_intent_id', 'text'],
    ['cart_id', 'numeric'],
    ['coupon_usage_applied', 'integer DEFAULT false'],
    ['stock_adjusted', 'integer DEFAULT false'],
  ],
  eg_carts: [
    ['email', 'text'],
    ['reminders_sent', 'numeric DEFAULT 0'],
    ['last_reminder_at', 'text'],
    ['recovered_at', 'text'],
    ['unsubscribed', 'integer DEFAULT false'],
  ],
  eg_shop_settings: [
    ['tax_enabled', 'integer DEFAULT true'],
    ['tax_prices_include_tax', 'integer DEFAULT true'],
    ['tax_display_including_tax', 'integer DEFAULT true'],
    ['tax_default_country', "text DEFAULT 'AU'"],
    ['tax_store_rate_pct', 'numeric DEFAULT 10'],
    ['tax_business_name', 'text'],
    ['tax_abn', 'text'],
    ['tax_business_address', 'text'],
    ['emails_processing', 'integer DEFAULT true'],
    ['emails_completed', 'integer DEFAULT true'],
    ['emails_on_hold', 'integer DEFAULT true'],
    ['emails_cancelled', 'integer DEFAULT true'],
    ['emails_refunded', 'integer DEFAULT true'],
    ['emails_failed', 'integer DEFAULT false'],
    ['emails_customer_note', 'integer DEFAULT true'],
    ['emails_new_order_admin', 'integer DEFAULT false'],
    ['emails_admin_email', 'text'],
    ['emails_body_template', 'text'],
    ['abandoned_cart_enabled', 'integer DEFAULT false'],
    ['abandoned_cart_first_delay_hours', 'numeric DEFAULT 1'],
    ['abandoned_cart_second_delay_hours', 'numeric DEFAULT 24'],
    ['abandoned_cart_max_reminders', 'numeric DEFAULT 2'],
    ['abandoned_cart_subject', "text DEFAULT 'You left something in your cart'"],
    ['abandoned_cart_body_template', 'text'],
  ],
  // The document-lock join table keeps one foreign-key column per collection.
  eg_locked_documents_rels: ['shipping_zones', 'tax_rates', 'coupons', 'order_refunds'].map((n): [string, string] => [`eg_${n}_id`, 'integer']),
}

const addColumn = async (db: Runner, table: string, column: string, type: string): Promise<void> => {
  try {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/duplicate column name/i.test(message)) throw error
  }
}

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const [table, cols] of Object.entries(COLUMNS)) {
    for (const [column, type] of cols) await addColumn(db, table, column, type)
  }
  for (const statement of INDEXES) await db.run(sql.raw(statement))
  for (const n of ['shipping_zones', 'tax_rates', 'coupons', 'order_refunds']) {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`eg_locked_documents_rels_eg_${n}_id_idx\` ON \`eg_locked_documents_rels\` (\`eg_${n}_id\`)`))
  }
  engine.logger.info('[migrate] shop orders, shipping, tax, coupons and refunds tables ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the shop tables are left in place.')
}
