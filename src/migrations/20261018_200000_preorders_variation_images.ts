import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Pre-orders and variation images. Idempotent: every added column is checked with PRAGMA table_info first,
// and a table that is not there yet is skipped (a later run picks it up). Column names mirror what
// src/cms/db/schema/generate.ts produces for the product fields in src/features/ecommerce/collections/productFields.ts
// (preorderFields).
// Variation images need no new column: eg_products_variations.image_id already exists (shop catalogue migration).
// No shop-level pre-order switch: eg_shop_settings is at the D1 limit of 100 columns, so a new column cannot be added there.

type Runner = MigrateUpArgs['db']

const COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['eg_products', 'preorder', 'integer DEFAULT false'],
  ['eg_products', 'preorder_release_date', 'text'],
  ['eg_products', 'preorder_note', 'text'],
  ['_eg_products_v', 'version_preorder', 'integer DEFAULT false'],
  ['_eg_products_v', 'version_preorder_release_date', 'text'],
  ['_eg_products_v', 'version_preorder_note', 'text'],
]

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  for (const [table, column, definition] of COLUMNS) {
    const existing = await columnsOf(db, table)
    // A missing table means nothing to alter yet (a partial install); the column arrives with the table.
    if (existing.size > 0 && !existing.has(column)) {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`))
    }
  }
  engine.logger.info('[migrate] pre-order columns ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the pre-order columns are left in place.')
}