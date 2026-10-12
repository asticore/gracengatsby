import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shipping and payments: the shipping-settings global (ship-from address, live rates, package presets and one
// group of keys per carrier), pay-later and wallet settings, shipping manifests, and the order columns that hold
// labels and tracking. Idempotent: tables are CREATE ... IF NOT EXISTS and columns are only added when
// PRAGMA table_info says they are missing. Column names mirror src/cms/db/schema/generate.ts.

type Runner = MigrateUpArgs['db']

const TS = "  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,\n  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL"

const create = (name: string, cols: string[]): string =>
  `CREATE TABLE IF NOT EXISTS \`${name}\` (\n  \`id\` integer PRIMARY KEY NOT NULL,\n${cols.map((c) => '  ' + c + ',\n').join('')}${TS}\n)`

const TABLES: string[] = [
  create('eg_shipping_manifests', [
    '`number` text',
    '`carrier` text',
    '`order_ids` text',
    '`order_count` numeric DEFAULT 0',
    '`parcel_count` numeric DEFAULT 0',
    '`weight_kg` numeric DEFAULT 0',
    "`status` text DEFAULT 'open'",
    '`carrier_reference` text',
    '`carrier_message` text',
    '`note` text',
  ]),
  create('eg_shipping_settings', []),
]

const COLUMNS: Record<string, [string, string][]> = {
  eg_orders: [
    ['shipments', 'text'],
    ['tracking_number', 'text'],
    ['tracking_carrier', 'text'],
    ['tracking_url', 'text'],
    ['shipped_at', 'text'],
  ],
  eg_payment_settings: [
    ['afterpay_enabled', 'integer DEFAULT false'],
    ['afterpay_min_order', 'numeric'],
    ['afterpay_max_order', 'numeric'],
    ['afterpay_countries', 'text'],
    ['afterpay_currencies', 'text'],
    ['afterpay_show_messaging', 'integer DEFAULT true'],
    ['afterpay_instalments', 'numeric DEFAULT 4'],
    ['klarna_enabled', 'integer DEFAULT false'],
    ['klarna_min_order', 'numeric'],
    ['klarna_max_order', 'numeric'],
    ['klarna_countries', 'text'],
    ['klarna_currencies', 'text'],
    ['klarna_show_messaging', 'integer DEFAULT true'],
    ['klarna_instalments', 'numeric DEFAULT 4'],
    ['wallets_apple_pay', 'integer DEFAULT true'],
    ['wallets_google_pay', 'integer DEFAULT true'],
  ],
  eg_shipping_settings: [
    ['origin_name', 'text'],
    ['origin_company', 'text'],
    ['origin_line1', 'text'],
    ['origin_line2', 'text'],
    ['origin_city', 'text'],
    ['origin_state', 'text'],
    ['origin_postcode', 'text'],
    ['origin_country', "text DEFAULT 'AU'"],
    ['origin_phone', 'text'],
    ['origin_email', 'text'],
    ['rates_live_rates', 'integer DEFAULT false'],
    ['rates_handling_flat', 'numeric DEFAULT 0'],
    ['rates_handling_pct', 'numeric DEFAULT 0'],
    ['rates_taxable', 'integer DEFAULT true'],
    ['packages', 'text'],
    ['carrier_auspost_enabled', 'integer DEFAULT false'],
    ['carrier_auspost_test_mode', 'integer DEFAULT true'],
    ['carrier_auspost_pac_key', 'text'],
    ['carrier_auspost_account_number', 'text'],
    ['carrier_auspost_api_key', 'text'],
    ['carrier_auspost_api_password', 'text'],
    ['carrier_sendle_enabled', 'integer DEFAULT false'],
    ['carrier_sendle_test_mode', 'integer DEFAULT true'],
    ['carrier_sendle_sendle_id', 'text'],
    ['carrier_sendle_api_key', 'text'],
    ['carrier_startrack_enabled', 'integer DEFAULT false'],
    ['carrier_startrack_test_mode', 'integer DEFAULT true'],
    ['carrier_startrack_account_number', 'text'],
    ['carrier_startrack_api_key', 'text'],
    ['carrier_startrack_api_password', 'text'],
    ['carrier_couriersplease_enabled', 'integer DEFAULT false'],
    ['carrier_couriersplease_test_mode', 'integer DEFAULT true'],
    ['carrier_couriersplease_account_number', 'text'],
    ['carrier_couriersplease_api_key', 'text'],
    ['carrier_dhl_enabled', 'integer DEFAULT false'],
    ['carrier_dhl_test_mode', 'integer DEFAULT true'],
    ['carrier_dhl_api_key', 'text'],
    ['carrier_dhl_api_secret', 'text'],
    ['carrier_dhl_account_number', 'text'],
    ['carrier_ups_enabled', 'integer DEFAULT false'],
    ['carrier_ups_test_mode', 'integer DEFAULT true'],
    ['carrier_ups_client_id', 'text'],
    ['carrier_ups_client_secret', 'text'],
    ['carrier_ups_account_number', 'text'],
    ['carrier_fedex_enabled', 'integer DEFAULT false'],
    ['carrier_fedex_test_mode', 'integer DEFAULT true'],
    ['carrier_fedex_api_key', 'text'],
    ['carrier_fedex_secret_key', 'text'],
    ['carrier_fedex_account_number', 'text'],
    ['carrier_shipstation_enabled', 'integer DEFAULT false'],
    ['carrier_shipstation_test_mode', 'integer DEFAULT true'],
    ['carrier_shipstation_api_key', 'text'],
    ['carrier_shipstation_api_secret', 'text'],
    ['carrier_shippit_enabled', 'integer DEFAULT false'],
    ['carrier_shippit_test_mode', 'integer DEFAULT true'],
    ['carrier_shippit_api_key', 'text'],
  ],
  eg_locked_documents_rels: [['eg_shipping_manifests_id', 'integer']],
}

const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS `eg_shipping_manifests_number_idx` ON `eg_shipping_manifests` (`number`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_manifests_status_idx` ON `eg_shipping_manifests` (`status`)',
  'CREATE INDEX IF NOT EXISTS `eg_shipping_manifests_created_at_idx` ON `eg_shipping_manifests` (`created_at`)',
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
  for (const statement of INDEXES) await db.run(sql.raw(statement))
  if ((await columnsOf(db, 'eg_locked_documents_rels')).size > 0) {
    await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `eg_locked_documents_rels_eg_shipping_manifests_id_idx` ON `eg_locked_documents_rels` (`eg_shipping_manifests_id`)'))
  }
  engine.logger.info('[migrate] shipping settings, manifests and pay-later settings ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the shipping tables are left in place.')
}
