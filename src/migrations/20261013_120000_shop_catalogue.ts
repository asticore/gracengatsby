import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shop catalogue: product types, attributes, variations, SKU/GTIN, stock, sale schedule, weight and
// dimensions, shipping and tax class, linked products, reviews and the shop settings toggles.
// Idempotent: tables are CREATE ... IF NOT EXISTS and columns are only added when PRAGMA table_info
// says they are missing. Column names mirror what src/cms/db/schema/generate.ts produces for the
// collection configs under src/features/ecommerce/collections (productFields.ts and friends).

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const create = (name: string, cols: string[]): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`id\` integer PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')},\n${TS}\n)`

const child = (name: string, parent: string, cols: string[], versioned = false): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`_order\` integer NOT NULL,\n  \`_parent_id\` integer NOT NULL,\n  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')}${versioned ? ',\n  `_uuid` text' : ''},\n  FOREIGN KEY (\`_parent_id\`) REFERENCES \`${parent}\`(\`id\`) ON UPDATE no action ON DELETE cascade\n)`

/** Columns of one variation row (the same in the live and the versioned child table). */
const VARIATION_COLS = [
  '`attribute_values` text NOT NULL',
  '`sku` text',
  '`gtin` text',
  '`price_in_a_u_d` numeric',
  '`sale_price` numeric',
  '`sale_from` text',
  '`sale_to` text',
  '`manage_stock` integer DEFAULT false',
  '`stock_qty` numeric DEFAULT 0',
  "`backorders` text DEFAULT 'no'",
  "`stock_status` text DEFAULT 'instock'",
  '`image_id` integer',
  '`weight` numeric',
  '`length` numeric',
  '`width` numeric',
  '`height` numeric',
  '`enabled` integer DEFAULT true',
]

const ATTRIBUTE_COLS = ['`attribute_id` integer', '`name` text', '`values` text', '`visible` integer DEFAULT true', '`for_variations` integer DEFAULT false']

const noNotNull = (cols: string[]): string[] => cols.map((c) => c.replace(' NOT NULL', ''))

const TABLES: string[] = [
  create('eg_product_attributes', ['`name` text NOT NULL', '`slug` text', "`type` text DEFAULT 'select'"]),
  child('eg_product_attributes_terms', 'eg_product_attributes', ['`name` text NOT NULL', '`slug` text', '`swatch` text']),
  create('eg_shipping_classes', ['`name` text NOT NULL', '`slug` text', '`description` text']),
  create('eg_product_reviews', [
    '`product_id` integer NOT NULL',
    '`name` text NOT NULL',
    '`email` text',
    '`rating` numeric NOT NULL',
    '`text` text NOT NULL',
    "`status` text DEFAULT 'pending'",
    '`verified_owner` integer DEFAULT false',
  ]),
  child('eg_products_attributes', 'eg_products', ATTRIBUTE_COLS),
  child('eg_products_variations', 'eg_products', VARIATION_COLS),
  // Versioned child tables: the same columns, an integer autoincrement id and a _uuid.
  child('_eg_products_v_version_attributes', '_eg_products_v', ATTRIBUTE_COLS, true),
  child('_eg_products_v_version_variations', '_eg_products_v', noNotNull(VARIATION_COLS), true),
]

/** Scalar catalogue columns on a product (live table; the version table gets the same with a `version_` prefix). */
const PRODUCT_COLS: [string, string][] = [
  ['product_type', "text DEFAULT 'simple'"],
  ['sku', 'text'],
  ['gtin', 'text'],
  ['sale_price', 'numeric'],
  ['sale_from', 'text'],
  ['sale_to', 'text'],
  ['manage_stock', 'integer DEFAULT false'],
  ['stock_qty', 'numeric DEFAULT 0'],
  ['backorders', "text DEFAULT 'no'"],
  ['low_stock_threshold', 'numeric'],
  ['stock_status', "text DEFAULT 'instock'"],
  ['is_virtual', 'integer DEFAULT false'],
  ['is_downloadable', 'integer DEFAULT false'],
  ['weight', 'numeric'],
  ['length', 'numeric'],
  ['width', 'numeric'],
  ['height', 'numeric'],
  ['shipping_class_id', 'integer REFERENCES `eg_shipping_classes`(`id`) ON DELETE set null'],
  ['tax_class', "text DEFAULT 'standard'"],
  ['tax_class_other', 'text'],
  ['download_limit', 'numeric'],
  ['download_expiry_days', 'numeric'],
  ['external_url', 'text'],
  ['button_text', "text DEFAULT 'Buy'"],
  ['rating_average', 'numeric'],
  ['rating_count', 'numeric DEFAULT 0'],
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_products: PRODUCT_COLS,
  _eg_products_v: PRODUCT_COLS.map(([name, type]): [string, string] => [`version_${name}`, type]),
  // Related products, grouped products and downloads live in the owner's rels table.
  eg_products_rels: [['eg_products_id', 'integer'], ['eg_media_id', 'integer']],
  _eg_products_v_rels: [['eg_products_id', 'integer'], ['eg_media_id', 'integer']],
  // A cart line can name the variation being bought.
  eg_carts_items: [['variation', 'text']],
  eg_shop_settings: [
    ['reviews_enabled', 'integer DEFAULT true'],
    ['low_stock_emails', 'integer DEFAULT true'],
    ['stock_email_to', 'text'],
  ],
  eg_locked_documents_rels: ['product_attributes', 'shipping_classes', 'product_reviews'].map((n): [string, string] => [`eg_${n}_id`, 'integer']),
}

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_product_attributes_name_idx` ON `eg_product_attributes` (`name`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_attributes_slug_idx` ON `eg_product_attributes` (`slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_attributes_created_at_idx` ON `eg_product_attributes` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_attributes_terms_order_idx` ON `eg_product_attributes_terms` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_attributes_terms_parent_id_idx` ON `eg_product_attributes_terms` (`_parent_id`)',
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_shipping_classes_slug_idx` ON `eg_shipping_classes` (`slug`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_classes_created_at_idx` ON `eg_shipping_classes` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_reviews_product_idx` ON `eg_product_reviews` (`product_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_reviews_status_idx` ON `eg_product_reviews` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_product_reviews_created_at_idx` ON `eg_product_reviews` (`created_at`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_sku_idx` ON `eg_products` (`sku`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_attributes_order_idx` ON `eg_products_attributes` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_attributes_parent_id_idx` ON `eg_products_attributes` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_variations_order_idx` ON `eg_products_variations` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_variations_parent_id_idx` ON `eg_products_variations` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_variations_sku_idx` ON `eg_products_variations` (`sku`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_attributes_order_idx` ON `_eg_products_v_version_attributes` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_attributes_parent_id_idx` ON `_eg_products_v_version_attributes` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_variations_order_idx` ON `_eg_products_v_version_variations` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_variations_parent_id_idx` ON `_eg_products_v_version_variations` (`_parent_id`)',
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  // Parent tables a feature may not have yet are skipped: a later run picks them up.
  const present = new Set(((await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`)) as { name: string }[]).map((r) => r.name))
  for (const statement of TABLES) {
    const parent = /REFERENCES `([^`]+)`/.exec(statement)?.[1]
    if (parent && (await columnsOf(db, parent)).size === 0) continue
    await db.run(sql.raw(statement))
  }
  for (const [table, cols] of Object.entries(COLUMNS)) {
    if (!present.has(table)) continue
    const have = await columnsOf(db, table)
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
  for (const n of ['product_attributes', 'shipping_classes', 'product_reviews']) {
    if ((await columnsOf(db, 'eg_locked_documents_rels')).size === 0) break
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`eg_locked_documents_rels_eg_${n}_id_idx\` ON \`eg_locked_documents_rels\` (\`eg_${n}_id\`)`))
  }
  engine.logger.info('[migrate] shop catalogue tables and columns ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the catalogue tables are left in place.')
}
