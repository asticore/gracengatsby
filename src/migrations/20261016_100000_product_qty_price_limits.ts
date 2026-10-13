import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Per-product quantity limits (min and max per order), the "name your price" option with its suggested
// and minimum amounts, and the buyer's amount carried on a cart line. Idempotent: each column is only
// added when PRAGMA table_info says it is missing. Names mirror what src/cms/db/schema/generate.ts
// produces for the fields in src/features/ecommerce/collections/productFields.ts (limitFields) and
// shared.ts (cart items). Products are versioned, so the version table gets the same columns with a
// `version_` prefix.

type Runner = MigrateUpArgs['db']

const PRODUCT_COLS: [string, string][] = [
  ['min_qty', 'numeric'],
  ['max_qty', 'numeric'],
  ['name_your_price', 'integer DEFAULT false'],
  ['suggested_price', 'numeric'],
  ['min_price', 'numeric'],
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_products: PRODUCT_COLS,
  _eg_products_v: PRODUCT_COLS.map(([name, type]): [string, string] => [`version_${name}`, type]),
  eg_carts_items: [['price_cents', 'numeric']],
}

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

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
  engine.logger.info('[migrate] product quantity limits and name-your-price columns ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cheaply; the columns are left in place and are ignored when unused.
  engine.logger.info('[migrate] Down is a no-op - the quantity limit columns are left in place.')
}