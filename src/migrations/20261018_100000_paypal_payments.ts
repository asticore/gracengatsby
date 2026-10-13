import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// PayPal checkout: the PayPal order id and capture id on each shop order. Idempotent: every column is checked with
// PRAGMA table_info first, and the index is only created once the table exists. Names mirror the Orders collection
// fields paypalOrderId and paypalCaptureId (src/features/ecommerce/collections/Orders.ts).

type Runner = MigrateUpArgs['db']

const COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['eg_orders', 'paypal_order_id', 'text'],
  ['eg_orders', 'paypal_capture_id', 'text'],
]

const INDEXES = ['CREATE INDEX IF NOT EXISTS `eg_orders_paypal_order_id_idx` ON `eg_orders` (`paypal_order_id`)']

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
  if ((await columnsOf(db, 'eg_orders')).size > 0) {
    for (const statement of INDEXES) await db.run(sql.raw(statement))
  }
  engine.logger.info('[migrate] PayPal order and capture ids ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the PayPal columns are left in place.')
}
