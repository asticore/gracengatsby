import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shop-wide switches (table eg_shop_extra_settings, global `shop-extra-settings`) and the PayPal webhook id.
// Idempotent: the table is CREATE TABLE IF NOT EXISTS, and the webhook column is only added when PRAGMA table_info
// says it is missing and the table is there. Column names mirror src/cms/db/schema/generate.ts for
// src/globals/ShopExtraSettings.ts and the paypal group in src/globals/PaymentSettings.ts.
// eg_shop_settings is at the D1 limit of 100 columns, which is why the new switch gets its own table.

type Runner = MigrateUpArgs['db']

const columnsOf = async (db: Runner, table: string): Promise<Set<string>> =>
  new Set(((await db.all(sql.raw(`PRAGMA table_info(\`${table}\`)`))) as { name: string }[]).map((r) => r.name))

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      'CREATE TABLE IF NOT EXISTS `eg_shop_extra_settings` ( `id` integer PRIMARY KEY NOT NULL, `preorders_enabled` integer DEFAULT true, `updated_at` text, `created_at` text )',
    ),
  )

  // A partial install may not have the payment settings table yet; its column arrives with the table.
  const payment = await columnsOf(db, 'eg_payment_settings')
  if (payment.size > 0 && !payment.has('paypal_webhook_id')) {
    await db.run(sql.raw('ALTER TABLE `eg_payment_settings` ADD COLUMN `paypal_webhook_id` text'))
  }
  engine.logger.info('[migrate] Shop switches and PayPal webhook id ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the shop switches table and PayPal webhook column are left in place.')
}
