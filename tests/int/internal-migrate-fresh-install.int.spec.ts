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

  it('adds the per-user admin language column to users', async () => {
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames).toContain('admin_language')
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

  it('adds the product subscription table, plan column and switches (wave 19)', async () => {
    const checkColumns = async (table: string, expectedColumns: string[]): Promise<void> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      const columnNames = (result.results as { name: string }[]).map((r) => r.name)
      for (const col of expectedColumns) expect(columnNames, `${table} should have column ${col}`).toContain(col)
    }
    await checkColumns('eg_product_subscriptions', ['customer_id', 'product_id', 'status', 'billing_interval', 'payments_made', 'stripe_subscription_id', 'history'])
    await checkColumns('eg_products', ['subscription'])
    await checkColumns('_eg_products_v', ['version_subscription'])
    await checkColumns('eg_shop_extra_settings', ['subscriptions_enabled'])
    await checkColumns('eg_email_schedule', ['subscription_new_enabled', 'subscription_renewal_enabled', 'subscription_failed_enabled', 'subscription_cancelled_enabled'])
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
    expect(await columnsOf('eg_order_refunds')).toEqual(expect.arrayContaining(['lines', 'shipping_amount', 'items', 'restock']))
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

  it('creates the product add-on tables, the cart add-on column, the add-on switch and the pricing rule table', async () => {
    for (const table of ['eg_products_add_ons', '_eg_products_v_version_add_ons', 'eg_shop_extra_settings_pricing_rules']) {
      expect(tables, table).toContain(table)
    }
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_products_add_ons')).toEqual(expect.arrayContaining(['_order', '_parent_id', 'label', 'input_type', 'choices', 'required', 'price', 'price_mode', 'max_length']))
    expect(await columnsOf('_eg_products_v_version_add_ons')).toEqual(expect.arrayContaining(['_order', '_parent_id', '_uuid', 'label', 'price_mode']))
    expect(await columnsOf('eg_carts_items')).toContain('add_ons')
    expect(await columnsOf('eg_shop_extra_settings')).toEqual(expect.arrayContaining(['add_ons_enabled', 'pricing_rules_enabled']))
    expect(await columnsOf('eg_shop_extra_settings_pricing_rules')).toEqual(
      expect.arrayContaining(['_parent_id', 'name', 'enabled', 'discount_type', 'amount', 'applies_when', 'min_quantity', 'customer_role', 'min_subtotal', 'category', 'starts_at', 'ends_at', 'priority', 'exclusive', 'show_on_product']),
    )
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

  it('adds the hover-prefetch switch and the Data clean-up columns to the Speed settings', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_speed_settings')).toEqual(
      expect.arrayContaining([
        'advanced_preload_on_hover',
        'cleanup_enabled',
        'cleanup_keep_versions_per_doc',
        'cleanup_delete_trashed_after_days',
        'cleanup_delete_form_submissions_after_days',
        'cleanup_delete_audit_log_after_days',
        'cleanup_delete_email_log_after_days',
      ]),
    )
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

    // Wave 16 (20261025_100000_communication_connections): provider keys and SMS settings on Integrations.
    expect(await columnsOf('eg_integrations')).toEqual(
      expect.arrayContaining(['communications_default_provider', 'communications_fallback_provider', 'communications_resend_api_key', 'communications_brevo_api_key', 'communications_mandrill_api_key', 'communications_sms_twilio_auth_token', 'communications_sms_test_phone']),
    )
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

  it('adds the template repositories columns and repository list table', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_integrations')).toEqual(expect.arrayContaining(['template_repos_enabled', 'template_repos_token']))
    expect(tables, 'eg_integrations_template_repos_repos table should be created').toContain('eg_integrations_template_repos_repos')
    expect(await columnsOf('eg_integrations_template_repos_repos')).toEqual(
      expect.arrayContaining(['_order', '_parent_id', 'id', 'label', 'owner', 'repo', 'branch', 'path', 'enabled']),
    )
  })

  it('adds the page template kind, category and preview image columns', async () => {
    const names = (((await proxy.env.D1.prepare('PRAGMA table_info(`eg_page_templates`)').all()).results as { name: string }[])).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['kind', 'category', 'preview_image_id']))
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

  it('creates the site templates table, its _rels table and all 14 block tables, and a second run changes nothing', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_site_templates')
    expect(await columnsOf('eg_site_templates')).toEqual(
      expect.arrayContaining(['name', 'kind', 'enabled', 'priority', 'conditions', 'locks', 'updated_at', 'created_at']),
    )
    expect(tables).toContain('eg_site_templates_rels')
    expect(await columnsOf('eg_site_templates_rels')).toEqual(expect.arrayContaining(['eg_media_id', 'eg_faqs_id', 'eg_forms_id']))
    const blockTypes = ['cta_banner', 'element', 'event_grid', 'faq', 'form', 'gallery', 'hero', 'image_text', 'loop', 'product_grid', 'reusable_section', 'rich_text', 'section', 'toc']
    expect(blockTypes).toHaveLength(14)
    for (const type of blockTypes) expect(tables, `eg_site_templates_blocks_${type}`).toContain(`eg_site_templates_blocks_${type}`)

    const before = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master ORDER BY name`).all()
    const second = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(second.errorCount).toBe(0)
    const after = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master ORDER BY name`).all()
    expect(after.results).toEqual(before.results)
  }, 120_000)

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

  it('creates the when-emails-are-sent table and the event reminder columns', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_email_schedule')
    expect(await columnsOf('eg_email_schedule')).toEqual(
      expect.arrayContaining([
        'account_welcome_enabled',
        'account_reset_enabled',
        'membership_renewal_days_before',
        'event_reminder_enabled',
        'event_reminder_hours_before',
        'quiet_hours_enabled',
        'quiet_hours_start',
        'quiet_hours_end',
      ]),
    )
    expect(await columnsOf('eg_event_rsvps')).toEqual(expect.arrayContaining(['reminder_sent_at']))
    expect(await columnsOf('eg_email_templates')).toEqual(expect.arrayContaining(['event_reminder_subject', 'event_reminder_body']))
  })

  it('creates the Google connection table', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_google_connection')
    expect(await columnsOf('eg_google_connection')).toEqual(
      expect.arrayContaining(['client_id', 'client_secret_enc', 'refresh_token_enc', 'ga4_measurement_id', 'gtm_container_id', 'last_error']),
    )
  })

  it('creates the email design columns and the email design brand table', async () => {
    const designColumnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await designColumnsOf('eg_email_templates')).toEqual(
      expect.arrayContaining(['account_reset_design', 'account_welcome_design', 'rsvp_confirmation_design', 'event_reminder_design']),
    )
    expect(await designColumnsOf('eg_email_brand')).toEqual(
      expect.arrayContaining(['enabled', 'logo_id', 'logo_width', 'accent', 'text_color', 'background', 'content_background', 'font_stack', 'button_radius', 'footer_text', 'address']),
    )
  })

  it('creates the error log table with its indexes', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_error_log')
    expect(await columnsOf('eg_error_log')).toEqual(
      expect.arrayContaining(['source', 'message', 'stack', 'path', 'user_agent', 'count', 'first_seen', 'last_seen', 'fingerprint', 'status', 'updated_at', 'created_at']),
    )
  })

  it('creates the display currency table with its sort index', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('eg_shop_display_currencies')
    expect(await columnsOf('eg_shop_display_currencies')).toEqual(
      expect.arrayContaining(['code', 'enabled', 'sort_order', 'rate_mode', 'manual_rate', 'auto_rate', 'auto_rate_base', 'auto_rate_at', 'updated_at', 'created_at']),
    )
  })

  it('creates the AI builder usage table and the model and cap columns', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(tables).toContain('ai_builder_usage')
    expect(await columnsOf('ai_builder_usage')).toEqual(
      expect.arrayContaining(['id', 'created_at', 'user_id', 'provider', 'model', 'mode', 'input_tokens', 'output_tokens', 'est_cost_micro', 'ok']),
    )
    expect(await columnsOf('eg_integrations')).toEqual(expect.arrayContaining(['ai_claude_model', 'ai_openai_model', 'ai_monthly_cap_usd']))
  })

  it('adds the site-wide page effects columns to site settings', async () => {
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_site_settings`)').all()
    const names = (result.results as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['page_effects_enabled', 'page_effects_cursor', 'page_effects_scroll_progress', 'page_effects_reveal_on_scroll']))
  })

  it('adds the per-page background audio columns to pages and page versions', async () => {
    const live = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_pages`)').all()).results as { name: string }[]).map((r) => r.name)
    const versions = ((await proxy.env.D1.prepare('PRAGMA table_info(`_eg_pages_v`)').all()).results as { name: string }[]).map((r) => r.name)
    const cols = ['page_audio_enabled', 'page_audio_source_type', 'page_audio_media_id', 'page_audio_url', 'page_audio_loop', 'page_audio_volume', 'page_audio_start_muted', 'page_audio_show_controls', 'page_audio_start_on_first_interaction', 'page_audio_respect_reduced_data']
    expect(live).toEqual(expect.arrayContaining(cols))
    expect(versions).toEqual(expect.arrayContaining(cols.map((c) => `version_${c}`)))
  })

  it('adds the hide-native-cursor column and the post background audio columns', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_site_settings')).toContain('page_effects_hide_native_cursor')
    const cols = ['page_audio_enabled', 'page_audio_source_type', 'page_audio_media_id', 'page_audio_url', 'page_audio_loop', 'page_audio_volume']
    expect(await names('eg_posts')).toEqual(expect.arrayContaining(cols))
    expect(await names('_eg_posts_v')).toEqual(expect.arrayContaining(cols.map((c) => `version_${c}`)))
  })

  it('adds blog tags tables and public author columns on users', async () => {
    expect(tables).toContain('eg_posts_tags')
    expect(tables).toContain('_eg_posts_v_version_tags')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['display_name', 'slug']))
  })

  it('adds the blog author and tag switches and the per-post hide-author column', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_blog_settings')).toEqual(expect.arrayContaining(['show_authors', 'show_tags', 'author_archives']))
    expect(await names('eg_posts')).toContain('hide_author')
    expect(await names('_eg_posts_v')).toContain('version_hide_author')
  })

  it('adds the customer email verification columns and the site setting', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_users')).toEqual(
      expect.arrayContaining(['email_verified_at', 'email_verify_token_hash', 'email_verify_expires_at']),
    )
    expect(await names('eg_site_settings')).toContain('account_settings_require_email_verification')
  })

  it('email verification migration is safe to run twice', async () => {
    const mod = await import('@/migrations/20261112_100000_users_email_verification')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols.filter((c) => c === 'email_verified_at')).toHaveLength(1)
  })

  it('adds the two-factor backup code column and the customer enforcement setting', async () => {
    const names = async (t: string) =>
      ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${t}\`)`).all()).results as { name: string }[]).map((r) => r.name)
    expect(await names('eg_users')).toEqual(
      expect.arrayContaining(['two_factor_enabled', 'two_factor_secret', 'two_factor_confirmed_at', 'two_factor_last_used_step', 'two_factor_backup_hashes']),
    )
    expect(await names('eg_security_settings')).toEqual(
      expect.arrayContaining(['login_protection_require_two_factor_for_admins', 'login_protection_require_two_factor_for_members']),
    )
  })

  it('two-factor migration is safe to run twice', async () => {
    const mod = await import('@/migrations/20261113_100000_two_factor_backup_codes')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols.filter((c) => c === 'two_factor_backup_hashes')).toHaveLength(1)
  })

  it('creates the signed-in device sessions table with its indexes', async () => {
    expect(tables).toContain('eg_user_sessions')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_user_sessions`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'token_hash', 'device_label', 'ip', 'created_at', 'last_seen_at', 'expires_at', 'revoked_at']),
    )
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_user_sessions`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(indexes).toEqual(expect.arrayContaining(['eg_user_sessions_user_id_idx', 'eg_user_sessions_expires_at_idx']))
  })

  it('user sessions migration is safe to run twice and leaves existing rows alone', async () => {
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_user_sessions` (id, user_id, token_hash, created_at, expires_at) VALUES ('keep-me', 1, 'h', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')",
    ).run()
    const mod = await import('@/migrations/20261114_100000_user_sessions')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const rows = (await proxy.env.D1.prepare("SELECT id FROM `eg_user_sessions` WHERE id = 'keep-me'").all()).results as { id: string }[]
    expect(rows).toHaveLength(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_user_sessions` WHERE id = 'keep-me'").run()
  })

  it('creates eg_social_accounts with its unique and lookup indexes', async () => {
    expect(tables).toContain('eg_social_accounts')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_social_accounts`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'provider', 'provider_user_id', 'email', 'created_at', 'last_login_at']),
    )
    const indexes = ((await proxy.env.D1.prepare('PRAGMA index_list(`eg_social_accounts`)').all()).results as { name: string; unique: number }[])
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining(['eg_social_accounts_provider_user_idx', 'eg_social_accounts_user_id_idx']))
    expect(indexes.find((i) => i.name === 'eg_social_accounts_provider_user_idx')!.unique).toBe(1)
  })

  it('adds the social login columns to eg_security_settings, all switched off by default', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    for (const provider of ['google', 'github', 'apple', 'facebook', 'microsoft', 'discord']) {
      expect(byName.get(`social_login_${provider}_enabled`)).toBe('0')
      expect(byName.has(`social_login_${provider}_client_id`)).toBe(true)
    }
    expect(byName.get('social_login_allow_signup_via_social')).toBe('1')
    expect(byName.get('social_login_allow_admin_social_login')).toBe('0')
    expect(byName.get('social_login_microsoft_tenant')).toBe("'common'")
    expect(byName.has('social_login_apple_private_key')).toBe(true)
  })

  it('social login migration is safe to run twice and leaves existing links and settings alone', async () => {
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_social_accounts` (user_id, provider, provider_user_id, email, created_at) VALUES (1, 'google', 'keep-me', 'a@b.co', '2026-01-01T00:00:00.000Z')",
    ).run()
    const mod = await import('@/migrations/20261115_100000_social_login')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const rows = (await proxy.env.D1.prepare("SELECT provider_user_id FROM `eg_social_accounts` WHERE provider_user_id = 'keep-me'").all()).results as unknown[]
    expect(rows).toHaveLength(1)
    // The unique index refuses the same provider identity twice.
    await expect(
      proxy.env.D1.prepare(
        "INSERT INTO `eg_social_accounts` (user_id, provider, provider_user_id, created_at) VALUES (2, 'google', 'keep-me', '2026-01-01T00:00:00.000Z')",
      ).run(),
    ).rejects.toThrow()
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols.filter((c) => c === 'social_login_google_enabled')).toHaveLength(1)
    await proxy.env.D1.prepare("DELETE FROM `eg_social_accounts` WHERE provider_user_id = 'keep-me'").run()
  })

  it('creates the social accounts child table for integrations', async () => {
    expect(tables).toContain('eg_integrations_social_accounts')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_integrations_social_accounts`)').all()).results as { name: string }[]).map((r) => r.name)
    expect(cols).toEqual(expect.arrayContaining(['_order', '_parent_id', 'id', 'provider', 'label', 'account_id', 'access_token']))
  })

  it('creates the theme styles table', async () => {
    expect(tables).toContain('eg_theme_styles')
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_theme_styles`)').all()
    expect((result.results as { name: string }[]).map((r) => r.name)).toEqual(expect.arrayContaining(['id', 'data', 'updated_at']))
  })

  it('adds the edge page cache columns: cache version 1, page caching off, never-cache rules', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_speed_settings')).toEqual(
      expect.arrayContaining([
        'cache_epoch',
        'caching_page_cache',
        'caching_never_cache_paths',
        'caching_never_cache_cookies',
        'caching_never_cache_query_strings',
        'caching_cache_mobile_separately',
      ]),
    )
    const row = (await proxy.env.D1.prepare('SELECT caching_page_cache, cache_epoch FROM eg_speed_settings LIMIT 1').first()) as
      | { caching_page_cache: number | null; cache_epoch: number | null }
      | null
    if (row) {
      expect(Number(row.caching_page_cache ?? 0)).toBe(0)
      expect(Number(row.cache_epoch)).toBe(1)
    }
  })

  it('creates the product bundle tables and columns and the recommendation switches (wave 19)', async () => {
    for (const table of ['eg_products_bundle_items', '_eg_products_v_version_bundle_items']) expect(tables, table).toContain(table)
    const columnsOf = async (table: string): Promise<string[]> => {
      const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return (result.results as { name: string }[]).map((r) => r.name)
    }
    expect(await columnsOf('eg_products')).toEqual(expect.arrayContaining(['bundle_pricing', 'bundle_discount_percent']))
    expect(await columnsOf('_eg_products_v')).toEqual(expect.arrayContaining(['version_bundle_pricing', 'version_bundle_discount_percent']))
    expect(await columnsOf('eg_products_bundle_items')).toEqual(expect.arrayContaining(['_order', '_parent_id', 'product_id', 'quantity']))
    expect(await columnsOf('_eg_products_v_version_bundle_items')).toEqual(expect.arrayContaining(['_parent_id', 'product_id', 'quantity', '_uuid']))
    expect(await columnsOf('eg_shop_extra_settings')).toEqual(expect.arrayContaining(['recommendations_enabled', 'recommendations_max']))
  })

  it('creates the cron run history table with its columns (wave 17)', async () => {
    expect(tables).toContain('eg_cron_runs')
    const result = await proxy.env.D1.prepare('PRAGMA table_info(`eg_cron_runs`)').all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    for (const col of ['id', 'job', 'started_at', 'finished_at', 'ok', 'error', 'duration_ms']) {
      expect(columnNames, `eg_cron_runs should have column ${col}`).toContain(col)
    }
  })

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)

  it('adds the password policy columns to security settings and the password columns to users', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('password_min_length')).toBe('8')
    expect(byName.get('password_block_common')).toBe('0')
    expect(byName.get('password_history_count')).toBe('0')
    const users = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(users).toEqual(expect.arrayContaining(['password_changed_at', 'password_history_hashes']))
  })

  it('password policy migration is safe to run a second time and leaves the columns single', async () => {
    const mod = await import('@/migrations/20261116_100000_password_policy')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'password_history_hashes')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'password_changed_at')).toHaveLength(1)
  })

  it('adds the passwordless columns to security settings, all off by default, and creates eg_login_tokens', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('magic_link_enabled')).toBe('0')
    expect(byName.get('email_code_enabled')).toBe('0')
    expect(byName.get('allow_passwordless_for_admins')).toBe('0')
    expect(byName.get('passwordless_token_minutes')).toBe('15')
    expect(tables).toContain('eg_login_tokens')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_login_tokens`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['user_id', 'kind', 'token_hash', 'attempts', 'expires_at', 'used_at']))
  })

  it('adds the passkey columns to security settings, off by default, and creates eg_passkeys', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('passkeys_enabled')).toBe('0')
    expect(byName.get('passkeys_allow_admins')).toBe('0')
    expect(tables).toContain('eg_passkeys')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_passkeys`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['user_id', 'credential_id', 'public_key', 'sign_count', 'last_used_at']))
  })

  it('passkey migration is safe to run a second time and leaves the columns and table single', async () => {
    const mod = await import('@/migrations/20261118_100000_passkeys')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'passkeys_enabled')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'passkeys_rp_name')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_passkeys'").first()) as { n: number }
    expect(tableRows.n).toBe(1)
  })

  it('adds the api key columns to security settings, off by default, and creates eg_api_keys', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('api_keys_enabled')).toBe('0')
    expect(byName.get('api_keys_allow_customers')).toBe('0')
    expect(byName.get('api_keys_max_per_user')).toBe('5')
    expect(tables).toContain('eg_api_keys')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_api_keys`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['user_id', 'key_hash', 'scopes', 'last_used_at', 'expires_at', 'revoked_at']))
  })

  it('api key migration is safe to run a second time and leaves the columns and table single', async () => {
    const mod = await import('@/migrations/20261119_100000_api_keys')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'api_keys_enabled')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'api_keys_max_lifetime_days')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_api_keys'").first()) as { n: number }
    expect(tableRows.n).toBe(1)
  })

  it('passwordless migration is safe to run a second time and leaves the columns and table single', async () => {
    const mod = await import('@/migrations/20261117_100000_passwordless_login')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'magic_link_enabled')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'passwordless_token_minutes')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_login_tokens'").first()) as { n: number }
    expect(tableRows.n).toBe(1)
  })

  it('adds the impersonation columns to security settings, off by default, and creates eg_impersonations', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('impersonation_enabled')).toBe('0')
    expect(byName.get('impersonation_max_minutes')).toBe('30')
    expect(byName.get('impersonation_require2fa')).toBe('1')
    expect(tables).toContain('eg_impersonations')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_impersonations`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['admin_id', 'target_user_id', 'reason', 'started_at', 'ended_at', 'expires_at', 'session_id']))
  })

  it('impersonation migration is safe to run a second time and leaves the columns and table single', async () => {
    const mod = await import('@/migrations/20261120_100000_impersonation')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'impersonation_enabled')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'impersonation_require2fa')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_impersonations'").first()) as { n: number }
    expect(tableRows.n).toBe(1)
  })

  it('adds the email verification settings, off by default, and creates eg_email_verifications and eg_rate_limits', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('email_verification_required')).toBe('0')
    expect(byName.get('email_verification_cooldown_seconds')).toBe('60')
    expect(tables).toContain('eg_email_verifications')
    expect(tables).toContain('eg_rate_limits')
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_rate_limits`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['key', 'window_start', 'count', 'expires_at']))
  })

  it('auth slice 2 migration is safe to run a second time and leaves the columns and tables single', async () => {
    const mod = await import('@/migrations/20261121_100000_auth_slice_2')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'email_verification_required')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'email_verification_cooldown_seconds')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('eg_email_verifications','eg_rate_limits')").first()) as { n: number }
    expect(tableRows.n).toBe(2)
  })

  it('adds the auth slice 3 columns to security settings, all off by default, and creates the email code and trusted device tables', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.has('two_factor_required_roles')).toBe(true)
    expect(byName.has('two_factor_grace_ends_at')).toBe(true)
    expect(byName.get('two_factor_email_otp_enabled')).toBe('0')
    expect(byName.get('trusted_devices_enabled')).toBe('0')
    expect(byName.get('trusted_device_days')).toBe('30')
    expect(tables).toContain('eg_two_factor_email_codes')
    expect(tables).toContain('eg_trusted_devices')
    const emailCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_two_factor_email_codes`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(emailCols).toEqual(expect.arrayContaining(['user_id', 'purpose', 'code_hash', 'attempts', 'created_at', 'expires_at', 'used_at']))
    const deviceCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_trusted_devices`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(deviceCols).toEqual(expect.arrayContaining(['id', 'user_id', 'token_hash', 'label', 'ip', 'created_at', 'last_used_at', 'expires_at', 'revoked_at']))
  })

  it('auth slice 3 migration is safe to run a second time and leaves the columns and tables single', async () => {
    const mod = await import('@/migrations/20261122_100000_auth_slice_3')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    for (const column of ['two_factor_required_roles', 'two_factor_grace_ends_at', 'two_factor_email_otp_enabled', 'trusted_devices_enabled', 'trusted_device_days']) {
      expect(info.filter((c) => c.name === column), column).toHaveLength(1)
    }
    for (const table of ['eg_two_factor_email_codes', 'eg_trusted_devices']) {
      const rows = (await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${table}'`).first()) as { n: number }
      expect(rows.n, table).toBe(1)
    }
  })

  it('adds password_groups_enabled (on by default) and creates the password group tables with their indexes', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    expect(new Map(info.map((c) => [c.name, c.dflt_value])).get('password_groups_enabled')).toBe('1')
    for (const table of ['eg_password_groups', 'eg_content_access']) expect(tables, table).toContain(table)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_password_groups`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'name', 'hash', 'expires_at', 'max_uses', 'use_count', 'created_at', 'updated_at']))
    const accessCols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_content_access`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(accessCols).toEqual(expect.arrayContaining(['collection', 'doc_id', 'mode', 'group_id', 'roles', 'tiers', 'updated_at']))
  })

  it('password groups migration is safe to run a second time and leaves the columns and tables single', async () => {
    const mod = await import('@/migrations/20261123_100000_password_groups')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'password_groups_enabled')).toHaveLength(1)
    for (const table of ['eg_password_groups', 'eg_content_access']) {
      const row = (await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${table}'`).first()) as { n: number }
      expect(row.n, table).toBe(1)
    }
  })

  it('adds the organization columns to security settings, off by default, and creates the organization tables', async () => {
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string; dflt_value: string | null }[]
    const byName = new Map(info.map((c) => [c.name, c.dflt_value]))
    expect(byName.get('organizations_enabled')).toBe('0')
    expect(byName.get('organizations_max_per_account')).toBe('5')
    for (const table of ['eg_organizations', 'eg_organization_members', 'eg_organization_roles', 'eg_organization_teams', 'eg_organization_team_members', 'eg_organization_invitations', 'eg_content_org_visibility']) {
      expect(tables, table).toContain(table)
    }
  })

  it('organizations migration is registered before the later migrations and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 9].name).toBe('20261124_100000_organizations')
    const mod = await import('@/migrations/20261124_100000_organizations')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'organizations_enabled')).toHaveLength(1)
    expect(info.filter((c) => c.name === 'organizations_who_may_create')).toHaveLength(1)
    const tableRows = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_organizations'").first()) as { n: number }
    expect(tableRows.n).toBe(1)
  })

  it('translation workflow migration is registered before machine translation, adds its columns, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 8].name).toBe('20261125_100000_translation_workflow')
    const mod = await import('@/migrations/20261125_100000_translation_workflow')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await proxy.env.D1.prepare(
      "INSERT INTO `eg_translations` (locale, source_kind, source_id, field_path, value, source_text) VALUES ('fr', 'collection', 'pages:wf-1', 'title', 'Bonjour', 'Hello'), ('fr', 'collection', 'pages:wf-1', 'excerpt', NULL, 'Hi')",
    ).run()
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const colsOf = async (table: string) => ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()).results as { name: string }[]).map((c) => c.name)
    expect(await colsOf('eg_translations')).toEqual(expect.arrayContaining(['status', 'machine_provider', 'assigned_to', 'reviewed_by', 'reviewed_at']))
    expect(await colsOf('eg_language_settings')).toEqual(expect.arrayContaining(['multilingual_require_review', 'multilingual_admins_bypass_review', 'multilingual_translation_rules']))
    const statuses = (await proxy.env.D1.prepare("SELECT field_path AS fieldPath, status FROM `eg_translations` WHERE source_id = 'pages:wf-1' ORDER BY field_path").all()).results as { fieldPath: string; status: string }[]
    expect(statuses).toEqual([
      { fieldPath: 'excerpt', status: 'missing' },
      { fieldPath: 'title', status: 'approved' },
    ])
    await proxy.env.D1.prepare("DELETE FROM `eg_translations` WHERE source_id = 'pages:wf-1'").run()
  })

  it('machine translation migration is registered before auto-draft, adds its keys, settings and usage table, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 7].name).toBe('20261126_100000_machine_translation')
    const mod = await import('@/migrations/20261126_100000_machine_translation')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const colsOf = async (table: string) => ((await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()).results as { name: string }[]).map((c) => c.name)
    expect(await colsOf('eg_integrations')).toEqual(expect.arrayContaining(['translation_google_api_key', 'translation_deepl_api_key', 'translation_deepl_plan']))
    expect(await colsOf('eg_language_settings')).toEqual(
      expect.arrayContaining(['multilingual_machine_enabled', 'multilingual_machine_default_provider', 'multilingual_machine_overrides', 'multilingual_machine_monthly_char_limit']),
    )
    expect(await colsOf('eg_machine_translation_usage')).toEqual(expect.arrayContaining(['created_at', 'provider', 'locale', 'chars', 'ok']))
  })

  it('admin UI language migration is registered before the interface overrides, adds the user column, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 5].name).toBe('20261128_100000_admin_ui_language')
    const mod = await import('@/migrations/20261128_100000_admin_ui_language')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_users`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols.filter((c) => c === 'admin_language')).toHaveLength(1)
  })

  it('storefront interface overrides migration is registered before the domain settings, adds its column, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 4].name).toBe('20261129_100000_interface_overrides')
    const mod = await import('@/migrations/20261129_100000_interface_overrides')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_language_settings`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols.filter((c) => c === 'interface_overrides')).toHaveLength(1)
  })

  it('domain settings migration is registered before the admin URL and content domains migrations, creates the registry tables, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 3].name).toBe('20261130_100000_domain_settings')
    const mod = await import('@/migrations/20261130_100000_domain_settings')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_domain_settings_domains`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['_order', '_parent_id', 'host', 'label', 'default_locale', 'currency_hint', 'is_primary', 'status', 'redirect_to_primary', 'allow_admin']))
    const parent = (await proxy.env.D1.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='eg_domain_settings'").first()) as { n: number }
    expect(parent.n).toBe(1)
  })

  it('admin URL migration is registered last, adds its column, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 2].name).toBe('20261130_110000_admin_path')
    const mod = await import('@/migrations/20261130_110000_admin_path')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const cols = ((await proxy.env.D1.prepare('PRAGMA table_info(`eg_security_settings`)').all()).results as { name: string }[]).map((c) => c.name)
    expect(cols.filter((c) => c === 'admin_path')).toHaveLength(1)
  })

  it('machine auto-draft migration is registered before the admin language migration, adds its switch, and is safe to run a second time', async () => {
    const { migrations } = await import('@/migrations/index')
    expect(migrations[migrations.length - 6].name).toBe('20261127_100000_machine_autodraft')
    const mod = await import('@/migrations/20261127_100000_machine_autodraft')
    const { drizzle } = await import('drizzle-orm/d1')
    const db = drizzle(proxy.env.D1) as never
    const engine = { logger: consoleLogger } as never
    await mod.up({ db, engine } as never)
    await mod.up({ db, engine } as never)
    const info = (await proxy.env.D1.prepare('PRAGMA table_info(`eg_language_settings`)').all()).results as { name: string }[]
    expect(info.filter((c) => c.name === 'multilingual_machine_auto_draft')).toHaveLength(1)
  })
})
