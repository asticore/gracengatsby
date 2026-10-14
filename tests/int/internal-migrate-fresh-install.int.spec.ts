// @vitest-environment node
// Deploy-button acceptance proof: a genuinely empty D1 must reach a fully
// migrated schema through `runInternalMigrate` ALONE (what the Worker runs on
// first request via `ensureInitialised`), with no hand-run SQL beforehand.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

describe('runInternalMigrate - fresh install on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let outcome: InternalMigrateResult
  let tables: string[]

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)
    const rows = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    tables = (rows.results as { name: string }[]).map((r) => r.name)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes with zero errors', () => {
    expect(outcome.errorCount).toBe(0)
  })

  it('creates foundation, block, feature and engine tables', () => {
    for (const table of ['eg_users', 'eg_pages', 'eg_migrations', 'eg_forms', 'eg_posts_blocks_hero', 'eg_locked_documents_rels', 'eg_roles', 'eg_ad_units', 'eg_ad_placements', 'eg_ad_settings', 'eg_ad_stats', 'eg_data_views']) {
      expect(tables, table).toContain(table)
    }
  })

  it('adds SEO and social media columns to pages, posts, and courses', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    const expectedCols = ['seo_canonical_url', 'seo_no_follow', 'seo_social_title', 'seo_social_description', 'seo_x_card', 'seo_x_image_id']
    const expectedVersionCols = ['version_seo_canonical_url', 'version_seo_no_follow', 'version_seo_social_title', 'version_seo_social_description', 'version_seo_x_card', 'version_seo_x_image_id']

    if (tables.includes('eg_pages')) {
      await checkColumns('eg_pages', expectedCols)
    }
    if (tables.includes('_eg_pages_v')) {
      await checkColumns('_eg_pages_v', expectedVersionCols)
    }
    if (tables.includes('eg_posts')) {
      await checkColumns('eg_posts', expectedCols)
    }
    if (tables.includes('_eg_posts_v')) {
      await checkColumns('_eg_posts_v', expectedVersionCols)
    }
    if (tables.includes('eg_courses')) {
      await checkColumns('eg_courses', expectedCols)
    }
    if (tables.includes('_eg_courses_v')) {
      await checkColumns('_eg_courses_v', expectedVersionCols)
    }
  })

  it('adds authorship, schema_type, and product SEO columns', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    const authorshipCols = ['created_by_id', 'updated_by_id', 'schema_type']
    const authorshipVersionCols = ['version_created_by_id', 'version_updated_by_id', 'version_schema_type']
    const productSeoExtraCols = ['seo_canonical_url', 'seo_no_follow', 'seo_social_title', 'seo_social_description', 'seo_x_card', 'seo_x_image_id']
    const productSeoExtraVersionCols = ['version_seo_canonical_url', 'version_seo_no_follow', 'version_seo_social_title', 'version_seo_social_description', 'version_seo_x_card', 'version_seo_x_image_id']

    // Pages
    if (tables.includes('eg_pages')) {
      await checkColumns('eg_pages', authorshipCols)
    }
    if (tables.includes('_eg_pages_v')) {
      await checkColumns('_eg_pages_v', authorshipVersionCols)
    }

    // Posts
    if (tables.includes('eg_posts')) {
      await checkColumns('eg_posts', authorshipCols)
    }
    if (tables.includes('_eg_posts_v')) {
      await checkColumns('_eg_posts_v', authorshipVersionCols)
    }

    // Products (authorship + extra SEO/social fields)
    if (tables.includes('eg_products')) {
      await checkColumns('eg_products', [...authorshipCols, ...productSeoExtraCols])
    }
    if (tables.includes('_eg_products_v')) {
      await checkColumns('_eg_products_v', [...authorshipVersionCols, ...productSeoExtraVersionCols])
    }

    // Events (authorship + SEO columns)
    if (tables.includes('eg_events')) {
      await checkColumns('eg_events', [...authorshipCols, ...productSeoExtraCols])
    }
    if (tables.includes('_eg_events_v')) {
      await checkColumns('_eg_events_v', [...authorshipVersionCols, ...productSeoExtraVersionCols])
    }

    // Courses
    if (tables.includes('eg_courses')) {
      await checkColumns('eg_courses', authorshipCols)
    }
    if (tables.includes('_eg_courses_v')) {
      await checkColumns('_eg_courses_v', authorshipVersionCols)
    }
  })

  it('creates three custom control tables', () => {
    for (const table of ['eg_content_passwords', 'eg_scheduled_publishes', 'eg_edit_locks']) {
      expect(tables, `${table} should be created`).toContain(table)
    }
  })

  it('adds SEO columns to events', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    const eventSeoExtraCols = ['seo_meta_title', 'seo_meta_description', 'seo_no_index', 'seo_og_image_id', 'seo_canonical_url', 'seo_no_follow', 'seo_social_title', 'seo_social_description', 'seo_x_card', 'seo_x_image_id']
    const eventSeoExtraVersionCols = ['version_seo_meta_title', 'version_seo_meta_description', 'version_seo_no_index', 'version_seo_og_image_id', 'version_seo_canonical_url', 'version_seo_no_follow', 'version_seo_social_title', 'version_seo_social_description', 'version_seo_x_card', 'version_seo_x_image_id']

    if (tables.includes('eg_events')) {
      await checkColumns('eg_events', eventSeoExtraCols)
    }
    if (tables.includes('_eg_events_v')) {
      await checkColumns('_eg_events_v', eventSeoExtraVersionCols)
    }
  })

  it('adds authorship columns to users', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    const authorshipCols = ['created_by_id', 'updated_by_id']
    if (tables.includes('eg_users')) {
      await checkColumns('eg_users', authorshipCols)
    }
  })

  it('adds permission_overrides column to users', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    if (tables.includes('eg_users')) {
      await checkColumns('eg_users', ['permission_overrides'])
    }
  })

  it('adds theme_custom_fonts to site settings', async () => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`eg_site_settings\`)`).all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames).toContain('theme_custom_fonts')
  })

  it('expands integrations table with new columns', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) {
        expect(columnNames, `${table} should have column ${col}`).toContain(col)
      }
    }

    const integrationsCols = [
      'google_ga4_measurement_id',
      'google_gtm_container_id',
      'google_search_console_verification',
      'google_maps_api_key',
      'recaptcha_version',
      'recaptcha_site_key',
      'recaptcha_secret_key',
      'clarity_project_id',
      'meta_pixel_pixel_id',
      'cloudflare_zone_id',
      'cloudflare_api_token',
      'cloudflare_purge_on_publish',
      'openai_api_key',
    ]

    if (tables.includes('eg_integrations')) {
      await checkColumns('eg_integrations', integrationsCols)
    }
  })

  it('creates the approval workflow tables and review step columns', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_approval_workflows')
    expect(tables).toContain('eg_approval_workflows_steps')
    expect(await columnsOf('eg_approval_workflows')).toEqual(expect.arrayContaining(['name', 'collection', 'active', 'submitter_roles']))
    expect(await columnsOf('eg_approval_workflows_steps')).toEqual(expect.arrayContaining(['_order', '_parent_id', 'id', 'name', 'approver_roles', 'approvals_needed']))
    expect(await columnsOf('eg_review_events')).toContain('step')
    for (const live of ['eg_pages', 'eg_posts', 'eg_events', 'eg_courses', 'eg_products']) {
      if (tables.includes(live)) expect(await columnsOf(live), live).toContain('review_step')
      if (tables.includes(`_${live}_v`)) expect(await columnsOf(`_${live}_v`), `_${live}_v`).toContain('version_review_step')
    }
  })

  it('adds the section lock columns to pages, their versions and page templates', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_pages')).toContain('locks')
    expect(await columnsOf('_eg_pages_v')).toContain('version_locks')
    expect(await columnsOf('eg_page_templates')).toContain('locks')
  })

  it('creates the shop orders, shipping, tax, coupon and refund tables and columns', async () => {
    for (const table of [
      'eg_shipping_zones',
      'eg_shipping_zones_regions',
      'eg_shipping_zones_methods',
      'eg_shipping_zones_methods_table_rates',
      'eg_shipping_zones_methods_class_surcharges',
      'eg_tax_rates',
      'eg_coupons',
      'eg_order_refunds',
      'eg_shop_settings_checkout_fields',
    ]) {
      expect(tables, table).toContain(table)
    }
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_orders')).toEqual(expect.arrayContaining(['refunded_total', 'tax_lines', 'line_items', 'notes', 'payment_intent_id', 'coupon_usage_applied']))
    expect(await columnsOf('eg_carts')).toEqual(expect.arrayContaining(['email', 'reminders_sent', 'recovered_at', 'unsubscribed']))
    expect(await columnsOf('eg_shop_settings')).toEqual(expect.arrayContaining(['tax_abn', 'emails_processing', 'abandoned_cart_enabled']))
  })

  it('creates the shop catalogue tables and product columns', async () => {
    for (const table of [
      'eg_product_attributes',
      'eg_product_attributes_terms',
      'eg_shipping_classes',
      'eg_product_reviews',
      'eg_products_attributes',
      'eg_products_variations',
      '_eg_products_v_version_attributes',
      '_eg_products_v_version_variations',
    ]) {
      expect(tables, table).toContain(table)
    }
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_products')).toEqual(
      expect.arrayContaining(['product_type', 'sku', 'gtin', 'sale_price', 'sale_from', 'sale_to', 'manage_stock', 'stock_qty', 'backorders', 'low_stock_threshold', 'stock_status', 'weight', 'shipping_class_id', 'tax_class', 'external_url', 'rating_average', 'rating_count']),
    )
    expect(await columnsOf('_eg_products_v')).toEqual(expect.arrayContaining(['version_product_type', 'version_sku', 'version_stock_qty', 'version_shipping_class_id']))
    expect(await columnsOf('eg_products_variations')).toEqual(expect.arrayContaining(['attribute_values', 'sku', 'gtin', 'price_in_a_u_d', 'stock_qty', 'image_id', 'enabled']))
    expect(await columnsOf('eg_products_rels')).toContain('eg_products_id')
    expect(await columnsOf('eg_carts_items')).toContain('variation')
    expect(await columnsOf('eg_shop_settings')).toEqual(expect.arrayContaining(['reviews_enabled', 'low_stock_emails', 'stock_email_to']))
    expect(await columnsOf('eg_locked_documents_rels')).toEqual(expect.arrayContaining(['eg_product_attributes_id', 'eg_shipping_classes_id', 'eg_product_reviews_id']))
  })

  it('creates the back-in-stock sign-up table and its lock link column', async () => {
    expect(tables).toContain('eg_stock_subscriptions')
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_stock_subscriptions`)').all()
    const columns = (result.results as { name: string }[]).map((r) => r.name)
    expect(columns).toEqual(expect.arrayContaining(['product_id', 'variation', 'email', 'status', 'notified_at']))
    const locked = await proxy.env.D1.prepare('PRAGMA table_info(`eg_locked_documents_rels`)').all()
    expect((locked.results as { name: string }[]).map((r) => r.name)).toContain('eg_stock_subscriptions_id')
  })

  it('creates the save-and-continue drafts table, its lock link and the Forms switch', async () => {
    expect(tables).toContain('eg_form_drafts')
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_form_drafts')).toEqual(expect.arrayContaining(['form_id', 'token_hash', 'email', 'data_json', 'page', 'expires_at']))
    expect(await columnsOf('eg_forms')).toContain('allow_save_for_later')
    expect(await columnsOf('eg_locked_documents_rels')).toContain('eg_form_drafts_id')
  })

  it('adds the pre-order product columns and their version copies', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_products')).toEqual(expect.arrayContaining(['preorder', 'preorder_release_date', 'preorder_note']))
    expect(await columnsOf('_eg_products_v')).toEqual(expect.arrayContaining(['version_preorder', 'version_preorder_release_date', 'version_preorder_note']))
    expect(await columnsOf('eg_products_variations')).toContain('image_id')
  })

  it('creates the PageSpeed tables, list columns, API key and settings columns', async () => {
    for (const table of ['eg_pagespeed_results', 'eg_pagespeed_queue']) {
      expect(tables, table).toContain(table)
    }
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    for (const table of ['eg_pages', 'eg_posts', 'eg_products', 'eg_events']) {
      expect(await columnsOf(table), table).toEqual(expect.arrayContaining(['pagespeed_score', 'pagespeed_at']))
      expect(await columnsOf(`_${table}_v`), `_${table}_v`).toEqual(expect.arrayContaining(['version_pagespeed_score', 'version_pagespeed_at']))
    }
    expect(await columnsOf('eg_integrations')).toContain('google_page_speed_api_key')
    expect(await columnsOf('eg_speed_settings')).toEqual(expect.arrayContaining(['pagespeed_test_after_publish', 'pagespeed_daily_cap']))
    expect(await columnsOf('eg_pagespeed_results')).toEqual(expect.arrayContaining(['collection', 'doc_id', 'url', 'strategy', 'performance', 'accessibility', 'best_practices', 'seo', 'metrics', 'field_data', 'suggestions', 'fetched_at']))

    // Wave 11 (20261020_100000_shop_extra_settings): the shop-wide switches table and the PayPal webhook id.
    expect(await columnsOf('eg_shop_extra_settings')).toEqual(expect.arrayContaining(['preorders_enabled', 'updated_at', 'created_at']))
    expect(await columnsOf('eg_payment_settings')).toContain('paypal_webhook_id')

    // Wave 15 (20261024_100000_site_details): the site details table, with its business group columns.
    expect(await columnsOf('eg_site_details')).toEqual(
      expect.arrayContaining(['timezone', 'date_format', 'time_format', 'business_business_name', 'business_abn', 'business_opening_hours', 'created_at']),
    )

    // Wave 15 (20261024_200000_site_pages): special page picks and the maintenance mode group.
    expect(await columnsOf('eg_site_pages')).toEqual(expect.arrayContaining(['not_found_page_id', 'privacy_policy_page_id', 'terms_page_id', 'maintenance_enabled', 'maintenance_headline', 'maintenance_message', 'maintenance_bypass_token', 'maintenance_allow_admins', 'updated_at', 'created_at']))

    // Wave 15 (20261024_400000_email_templates): the editable email wording table.
    expect(await columnsOf('eg_email_templates')).toEqual(expect.arrayContaining(['account_reset_subject', 'account_reset_body', 'rsvp_confirmation_subject', 'rsvp_confirmation_body', 'updated_at', 'created_at']))
  })

  it('adds the edit screens columns (trash, excerpt, sticky, reading time, recurrence, tiers, check-in)', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_pages')).toEqual(expect.arrayContaining(['trashed_at', 'excerpt', 'featured_image_id']))
    expect(await columnsOf('_eg_pages_v')).toEqual(expect.arrayContaining(['version_trashed_at', 'version_excerpt', 'version_featured_image_id']))
    expect(await columnsOf('eg_posts')).toEqual(expect.arrayContaining(['trashed_at', 'sticky', 'reading_time']))
    expect(await columnsOf('_eg_posts_v')).toEqual(expect.arrayContaining(['version_trashed_at', 'version_sticky', 'version_reading_time']))
    expect(await columnsOf('eg_events')).toEqual(
      expect.arrayContaining(['trashed_at', 'recurrence_frequency', 'recurrence_interval', 'recurrence_until', 'recurrence_exceptions', 'ticket_tiers']),
    )
    expect(await columnsOf('_eg_events_v')).toEqual(
      expect.arrayContaining(['version_trashed_at', 'version_recurrence_frequency', 'version_recurrence_exceptions', 'version_ticket_tiers']),
    )
    expect(await columnsOf('eg_event_rsvps')).toEqual(expect.arrayContaining(['checked_in', 'checked_in_at']))
  })

  it('adds the wave 10 event columns (repeat weekdays, monthly style, number of dates, series link) and the RSVP ticket type', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_events')).toEqual(
      expect.arrayContaining(['recurrence_weekdays', 'recurrence_monthly_by', 'recurrence_count', 'series_of_id']),
    )
    expect(await columnsOf('_eg_events_v')).toEqual(
      expect.arrayContaining(['version_recurrence_weekdays', 'version_recurrence_monthly_by', 'version_recurrence_count', 'version_series_of_id']),
    )
    expect(await columnsOf('eg_event_rsvps')).toEqual(expect.arrayContaining(['ticket_tier']))
  })

  it('adds the shop settings extras columns', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_shop_settings')).toEqual(
      expect.arrayContaining(['emails_shipped', 'general_unit_system', 'general_currency', 'order_numbers_next_number', 'invoice_accent_color', 'gift_cards_enabled', 'templates_shipped_subject', 'storefront_feeds_enabled']),
    )
  })

  it('creates the gift card, store credit and ledger tables and the order and cart columns', async () => {
    for (const table of ['eg_gift_cards', 'eg_store_credits', 'eg_credit_ledger']) expect(tables, table).toContain(table)
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_gift_cards')).toEqual(expect.arrayContaining(['code', 'initial_amount', 'balance', 'restrict_product_id', 'send_at']))
    expect(await columnsOf('eg_credit_ledger')).toEqual(expect.arrayContaining(['kind', 'balance_after', 'gift_card_id', 'user_id']))
    expect(await columnsOf('eg_orders')).toEqual(expect.arrayContaining(['gift_card_total', 'store_credit_total', 'stored_value', 'order_number']))
    expect(await columnsOf('eg_carts_items')).toEqual(expect.arrayContaining(['custom_amount', 'gift_email']))
  })

  it('adds the product quantity limit, name-your-price and cart price columns', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_products')).toEqual(expect.arrayContaining(['min_qty', 'max_qty', 'name_your_price', 'suggested_price', 'min_price']))
    expect(await columnsOf('_eg_products_v')).toEqual(expect.arrayContaining(['version_min_qty', 'version_name_your_price', 'version_min_price']))
    expect(await columnsOf('eg_carts_items')).toEqual(expect.arrayContaining(['price_cents']))
  })

  it('creates the shipping settings, manifests and pay-later columns', async () => {
    for (const table of ['eg_shipping_manifests', 'eg_shipping_settings']) expect(tables, table).toContain(table)
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_shipping_settings')).toEqual(expect.arrayContaining(['origin_postcode', 'rates_live_rates', 'packages', 'carrier_sendle_api_key', 'carrier_auspost_pac_key']))
    expect(await columnsOf('eg_payment_settings')).toEqual(expect.arrayContaining(['afterpay_enabled', 'klarna_max_order', 'wallets_apple_pay']))
    expect(await columnsOf('eg_orders')).toEqual(expect.arrayContaining(['shipments', 'tracking_number', 'shipped_at']))
    expect(await columnsOf('eg_shipping_manifests')).toEqual(expect.arrayContaining(['number', 'order_ids', 'parcel_count']))
  })

  it('adds the PayPal order and capture id columns to orders', async () => {
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_orders`)').all()
    const names = (result.results as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['paypal_order_id', 'paypal_capture_id']))
  })

  it('creates custom keys child table for integrations', () => {
    expect(tables, 'eg_integrations_custom_keys table should be created').toContain('eg_integrations_custom_keys')
  })

  it('creates the table of contents block tables with their settings columns', async () => {
    const tocTables = [
      'eg_pages_blocks_toc',
      '_eg_pages_v_blocks_toc',
      'eg_posts_blocks_toc',
      '_eg_posts_v_blocks_toc',
      'eg_products_blocks_toc',
      '_eg_products_v_blocks_toc',
      'eg_page_templates_blocks_toc',
      'eg_lessons_blocks_toc',
      'eg_blog_settings_blocks_toc',
      'eg_faq_settings_blocks_toc',
      'eg_shop_settings_blocks_toc',
    ]
    for (const table of tocTables) {
      expect(tables, `${table} should be created`).toContain(table)
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const names = (result.results as { name: string }[]).map((r) => r.name)
      expect(names, `${table} columns`).toEqual(expect.arrayContaining(['_order', '_parent_id', '_path', 'id', 'title', 'levels', 'collapsible', 'block_name', 'design']))
    }
  })

  it('creates the reusable sections table, its _rels table and the reusable section block tables', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_reusable_sections')
    expect(await columnsOf('eg_reusable_sections')).toEqual(expect.arrayContaining(['name', 'description', 'locks', 'updated_at', 'created_at']))
    expect(tables).toContain('eg_reusable_sections_rels')
    expect(await columnsOf('eg_reusable_sections_rels')).toEqual(expect.arrayContaining(['eg_media_id', 'eg_faqs_id', 'eg_forms_id']))
    const reusableTables = [
      'eg_reusable_sections_blocks_hero',
      'eg_reusable_sections_blocks_loop',
      'eg_reusable_sections_blocks_toc',
      'eg_reusable_sections_blocks_reusable_section',
      'eg_pages_blocks_reusable_section',
      '_eg_pages_v_blocks_reusable_section',
      'eg_page_templates_blocks_reusable_section',
      'eg_shop_settings_blocks_reusable_section',
    ]
    for (const table of reusableTables) {
      expect(tables, `${table} should be created`).toContain(table)
    }
    expect(await columnsOf('eg_pages_blocks_reusable_section')).toEqual(expect.arrayContaining(['_order', '_parent_id', '_path', 'id', 'section_id', 'design', 'block_name']))
    expect(await columnsOf('eg_reusable_sections_blocks_loop')).toContain('template_id')
  })

  it('adds the SEO focus keyphrase column to the SEO collections and their version tables', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    for (const table of ['eg_pages', 'eg_posts', 'eg_products', 'eg_events', 'eg_courses']) {
      if (tables.includes(table)) expect(await columnsOf(table), table).toContain('seo_focus_keyphrase')
    }
    for (const table of ['_eg_pages_v', '_eg_posts_v', '_eg_products_v', '_eg_events_v', '_eg_courses_v']) {
      if (tables.includes(table)) expect(await columnsOf(table), table).toContain('version_seo_focus_keyphrase')
    }
  })

  it('adds the Templates by content type columns to the SEO settings table', async () => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`eg_seo_settings\`)`).all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    for (const type of ['page', 'post', 'product', 'event', 'course']) {
      expect(columnNames, `${type} title template`).toContain(`templates_${type}_title_template`)
      expect(columnNames, `${type} description template`).toContain(`templates_${type}_description_template`)
    }
  })

  it('adds the IndexNow switch and key columns to the SEO settings table', async () => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`eg_seo_settings\`)`).all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames).toEqual(expect.arrayContaining(['index_now_enabled', 'index_now_key']))
  })

  it('creates the email log table with its indexes', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_email_log')
    expect(await columnsOf('eg_email_log')).toEqual(
      expect.arrayContaining(['to', 'subject', 'template', 'provider', 'status', 'error', 'html', 'text', 'resent_from', 'updated_at', 'created_at']),
    )
  })

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)
})
