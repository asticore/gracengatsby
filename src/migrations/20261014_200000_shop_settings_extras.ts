import { MigrateUpArgs, MigrateDownArgs, sql } from '@/engine/db'

// Shop settings extras: currency and units, order and invoice numbering, invoice designer, gift card
// and store credit settings, per-status email wording, storefront toggles and the "shipped" email flag.
// Idempotent: a column is only added when PRAGMA table_info says it is missing. Column names mirror
// src/cms/db/schema/generate.ts for the groups in src/features/ecommerce/settingsFields.ts.

const COLUMNS: [string, string][] = [
  ['emails_shipped', 'integer DEFAULT true'],
  ['general_currency', "text DEFAULT 'AUD'"],
  ['general_unit_system', "text DEFAULT 'metric'"],
  ['order_numbers_prefix', 'text'],
  ['order_numbers_next_number', 'numeric DEFAULT 1001'],
  ['invoice_logo_url', 'text'],
  ['invoice_logo_height', 'numeric DEFAULT 48'],
  ['invoice_accent_color', "text DEFAULT '#111111'"],
  ['invoice_text_color', "text DEFAULT '#111111'"],
  ['invoice_font_family', "text DEFAULT 'sans'"],
  ['invoice_font_size', 'numeric DEFAULT 14'],
  ['invoice_header_text', 'text'],
  ['invoice_footer_text', 'text'],
  ['invoice_terms', 'text'],
  ['invoice_notes', 'text'],
  ['invoice_show_sku', 'integer DEFAULT true'],
  ['invoice_show_unit_price', 'integer DEFAULT true'],
  ['invoice_show_discount', 'integer DEFAULT true'],
  ['invoice_show_tax', 'integer DEFAULT true'],
  ['invoice_show_shipping', 'integer DEFAULT true'],
  ['invoice_show_customer_note', 'integer DEFAULT true'],
  ['invoice_show_payment_status', 'integer DEFAULT true'],
  ['invoice_title_mode', "text DEFAULT 'auto'"],
  ['invoice_tax_invoice_title', "text DEFAULT 'Tax invoice'"],
  ['invoice_invoice_title', "text DEFAULT 'Invoice'"],
  ['invoice_receipt_title', "text DEFAULT 'Receipt'"],
  ['invoice_number_prefix', "text DEFAULT 'INV-'"],
  ['invoice_next_number', 'numeric DEFAULT 1'],
  ['invoice_number_padding', 'numeric DEFAULT 5'],
  ['invoice_paper_size', "text DEFAULT 'A4'"],
  ['invoice_packing_slip_enabled', 'integer DEFAULT true'],
  ['invoice_packing_slip_note', 'text'],
  ['gift_cards_enabled', 'integer DEFAULT true'],
  ['gift_cards_store_credit_enabled', 'integer DEFAULT true'],
  ['gift_cards_allow_custom_amount', 'integer DEFAULT true'],
  ['gift_cards_min_amount', 'numeric DEFAULT 10'],
  ['gift_cards_max_amount', 'numeric DEFAULT 500'],
  ['gift_cards_preset_amounts', "text DEFAULT '25, 50, 100'"],
  ['gift_cards_expiry_months', 'numeric DEFAULT 0'],
  ['gift_cards_refund_to_store_credit', 'integer DEFAULT true'],
  ['templates_processing_subject', 'text'],
  ['templates_processing_body', 'text'],
  ['templates_completed_subject', 'text'],
  ['templates_completed_body', 'text'],
  ['templates_shipped_subject', 'text'],
  ['templates_shipped_body', 'text'],
  ['templates_on_hold_subject', 'text'],
  ['templates_on_hold_body', 'text'],
  ['templates_cancelled_subject', 'text'],
  ['templates_cancelled_body', 'text'],
  ['templates_refunded_subject', 'text'],
  ['templates_refunded_body', 'text'],
  ['templates_failed_subject', 'text'],
  ['templates_failed_body', 'text'],
  ['templates_customer_note_subject', 'text'],
  ['templates_customer_note_body', 'text'],
  ['templates_gift_card_subject', 'text'],
  ['templates_gift_card_body', 'text'],
  ['storefront_cross_sells_in_cart', 'integer DEFAULT true'],
  ['storefront_wishlist', 'integer DEFAULT true'],
  ['storefront_back_in_stock', 'integer DEFAULT true'],
  ['storefront_feeds_enabled', 'integer DEFAULT false'],
  ['storefront_feed_brand', 'text'],
  ['storefront_feed_google_category', 'text'],
  ['storefront_feed_condition', "text DEFAULT 'new'"],
]

export async function up({ db, engine }: MigrateUpArgs): Promise<void> {
  const have = new Set(((await db.all(sql.raw('PRAGMA table_info(`eg_shop_settings`)'))) as { name: string }[]).map((r) => r.name))
  if (have.size === 0) return
  for (const [column, type] of COLUMNS) {
    if (have.has(column)) continue
    await db.run(sql.raw(`ALTER TABLE \`eg_shop_settings\` ADD COLUMN \`${column}\` ${type}`))
  }
  engine.logger.info('[migrate] shop settings extras ready.')
}

export async function down({ engine }: MigrateDownArgs): Promise<void> {
  engine.logger.info('[migrate] Down is a no-op - the shop settings columns are left in place.')
}
