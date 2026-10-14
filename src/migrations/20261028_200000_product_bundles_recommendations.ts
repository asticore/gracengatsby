import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Product bundles and product recommendations (wave 19, agent B). Idempotent: tables are CREATE ... IF NOT EXISTS and
// columns are only added when PRAGMA table_info says they are missing. Names mirror what src/cms/db/schema/generate.ts
// produces for src/features/ecommerce/collections/productFields.ts (bundleFields: bundlePricing, bundleDiscountPercent and
// the bundleItems array) and src/globals/ShopExtraSettings.ts (recommendationsEnabled, recommendationsMax).
// Bundle components live in their own child tables, so eg_products gains only two columns (D1 caps a table at 100).
// Products are versioned, so the version table gets the same columns and child table with a `version_` prefix / _uuid.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

const PRODUCT_COLS: [string, string][] = [
  ['bundle_pricing', "text DEFAULT 'fixed'"],
  ['bundle_discount_percent', 'numeric'],
]

const SWITCH_COLS: [string, string][] = [
  ['recommendations_enabled', 'integer DEFAULT false'],
  ['recommendations_max', 'numeric DEFAULT 4'],
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_products: PRODUCT_COLS,
  _eg_products_v: PRODUCT_COLS.map(([name, type]): [string, string] => [`version_${name}`, type]),
  eg_shop_extra_settings: SWITCH_COLS,
}

/** One bundle component row. The same columns in the live and the versioned child table. */
const BUNDLE_COLS = ['`product_id` integer', '`quantity` numeric DEFAULT 1']

const child = (name: string, parent: string, cols: string[], versioned = false): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`_order\` integer NOT NULL,\n  \`_parent_id\` integer NOT NULL,\n  \`id\` ${versioned ? 'integer' : 'text'} PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c).join(',\n')}${versioned ? ',\n  `_uuid` text' : ''},\n  FOREIGN KEY (\`_parent_id\`) REFERENCES \`${parent}\`(\`id\`) ON UPDATE no action ON DELETE cascade\n)`

const TABLES: string[] = [
  child('eg_products_bundle_items', 'eg_products', BUNDLE_COLS),
  child('_eg_products_v_version_bundle_items', '_eg_products_v', BUNDLE_COLS, true),
]

const INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS `eg_products_bundle_items_order_idx` ON `eg_products_bundle_items` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `eg_products_bundle_items_parent_id_idx` ON `eg_products_bundle_items` (`_parent_id`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_bundle_items_order_idx` ON `_eg_products_v_version_bundle_items` (`_order`)',
  'CREATE INDEX IF NOT EXISTS `_eg_products_v_version_bundle_items_parent_id_idx` ON `_eg_products_v_version_bundle_items` (`_parent_id`)',
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const [table, cols] of Object.entries(COLUMNS)) {
    const have = await columnsOf(db, table)
    // A table that does not exist yet is created by its own migration; nothing to add here.
    if (have.size === 0) continue
    for (const [column, type] of cols) {
      if (have.has(column)) continue
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`))
    }
  }
  // The child tables need their parent table; a partial install without products gets them from the catalogue migration first.
  if ((await columnsOf(db, 'eg_products')).size > 0) {
    for (const statement of TABLES) await db.run(sql.raw(statement))
    for (const statement of INDEXES) await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] product bundle and recommendation columns and tables ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply; the bundle tables and columns are left in place and are ignored when unused.
  engine.logger.info('[migrate] Down is a no-op - the bundle and recommendation columns are left in place.')
}
