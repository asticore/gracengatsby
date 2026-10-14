import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Product add-ons (questions the buyer answers on a product page, optionally priced) and dynamic pricing
// rules (shop-wide discounts by quantity, role, subtotal or category). Idempotent: tables are CREATE ... IF NOT
// EXISTS, columns are only added when PRAGMA table_info says they are missing, and indexes are IF NOT EXISTS.
// Column names mirror what src/cms/db/schema/generate.ts produces for:
//   - the `addOns` array in src/features/ecommerce/collections/productAddOns.ts (live and versioned product tables)
//   - the `addOns` text field on the cart items (src/features/ecommerce/collections/shared.ts)
//   - the switches and the `pricingRules` array in src/globals/ShopExtraSettings.ts
// Per-product data lives in child tables, so eg_products keeps its column count.

type Runner = MigrateUpArgs['db']


/** A child array table. Versioned copies use an integer id and a `_uuid`, as the other version tables do. */
const child = (name: string, parent: string, parentType: 'integer', cols: string[], versioned = false): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`_order\` integer NOT NULL,\n  \`_parent_id\` ${parentType} NOT NULL,\n  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')}${versioned ? ',\n  `_uuid` text' : ''},\n  FOREIGN KEY (\`_parent_id\`) REFERENCES \`${parent}\`(\`id\`) ON UPDATE no action ON DELETE cascade\n)`

/** Columns of one add-on row (the same in the live and the versioned table, but versioned rows have no NOT NULL). */
const ADD_ON_COLS = [
  '`label` text NOT NULL',
  "`input_type` text DEFAULT 'text'",
  '`description` text',
  '`choices` text',
  '`required` integer DEFAULT false',
  '`price` numeric',
  "`price_mode` text DEFAULT 'fixed'",
  '`max_length` numeric',
]

const noNotNull = (cols: string[]): string[] => cols.map((c) => c.replace(' NOT NULL', ''))

/** One row of the shop-wide pricing rules (child of the shop-extra-settings global). */
const RULE_COLS = [
  '`name` text NOT NULL',
  '`enabled` integer DEFAULT true',
  "`discount_type` text DEFAULT 'percent'",
  '`amount` numeric NOT NULL',
  "`applies_when` text DEFAULT 'quantity'",
  '`min_quantity` numeric',
  '`customer_role` text',
  '`min_subtotal` numeric',
  '`category` text',
  '`starts_at` text',
  '`ends_at` text',
  '`priority` numeric DEFAULT 10',
  '`exclusive` integer DEFAULT false',
  '`show_on_product` integer DEFAULT false',
]

const TABLES: string[] = [
  child('eg_products_add_ons', 'eg_products', 'integer', ADD_ON_COLS),
  child('_eg_products_v_version_add_ons', '_eg_products_v', 'integer', noNotNull(ADD_ON_COLS), true),
  child('eg_shop_extra_settings_pricing_rules', 'eg_shop_extra_settings', 'integer', RULE_COLS),
]

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS `eg_products_add_ons_order_idx` ON `eg_products_add_ons` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_add_ons_parent_id_idx` ON `eg_products_add_ons` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_add_ons_order_idx` ON `_eg_products_v_version_add_ons` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_add_ons_parent_id_idx` ON `_eg_products_v_version_add_ons` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_shop_extra_settings_pricing_rules_order_idx` ON `eg_shop_extra_settings_pricing_rules` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_shop_extra_settings_pricing_rules_parent_id_idx` ON `eg_shop_extra_settings_pricing_rules` (`_parent_id`)',
]

/** Columns added to tables that already exist. A table that is not there yet is created with its own migration. */
const COLUMNS: Record<string, [string, string][]> = {
  eg_carts_items: [['add_ons', 'text']],
  eg_shop_extra_settings: [
    ['add_ons_enabled', 'integer DEFAULT true'],
    ['pricing_rules_enabled', 'integer DEFAULT true'],
  ],
}

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const statement of TABLES) await db.run(sql.raw(statement))
  for (const statement of INDEXES) await db.run(sql.raw(statement))
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const have = await columnsOf(db, table)
    if (have.size === 0) continue
    for (const [column, type] of cols) {
      if (have.has(column)) continue
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
  engine.logger.info('[migrate] product add-ons and dynamic pricing rules ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply, and the tables hold merchant data: both are left in place and ignored when unused.
  engine.logger.info('[migrate] Down is a no-op - the add-on and pricing rule tables and columns are left in place.')
}
