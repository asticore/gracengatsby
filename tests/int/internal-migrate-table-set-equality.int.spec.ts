// @vitest-environment node
// wrangler's getPlatformProxy() shells out to its bundled esbuild, which
// breaks under jsdom's separate vm realm (see tests/int/cms-db-faqs.int.spec.ts
// for the full explanation) - this suite is server-only and needs no DOM.
//
// LITERAL, EXACT TABLE-SET-EQUALITY PROOF.
//
// tests/int/internal-migrate-fresh-install.int.spec.ts already proves a
// representative sample of tables exist and are correctly `eg_`-prefixed.
// This suite goes further: it captures the FULL, authoritative table list
// from this project's already-migrated local-dev D1 (232 tables, captured via
// `npx wrangler d1 execute D1 --local --command "SELECT name FROM
// sqlite_master WHERE type='table' ORDER BY name"`, minus `_cf_METADATA` -
// a Cloudflare-managed system table that a `persist: false` in-memory proxy
// never creates, so it is not part of the schema this project owns) and
// asserts the result of `setupFreshInstall()` against a genuinely empty D1
// produces EXACTLY that set - no more, no fewer, no misnamed tables.
import { describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { setupFreshInstall } from './helpers/freshInstall'

// Captured from local dev D1 (already fully migrated) via:
//   npx wrangler d1 execute D1 --local --command \
//     "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
// `_cf_METADATA` excluded - see header comment above.
const EXPECTED_TABLES = [
  '_eg_courses_v',
  '_eg_events_v',
  '_eg_pages_v',
  '_eg_pages_v_blocks_cta_banner',
  '_eg_pages_v_blocks_element',
  '_eg_pages_v_blocks_event_grid',
  '_eg_pages_v_blocks_faq',
  '_eg_pages_v_blocks_form',
  '_eg_pages_v_blocks_gallery',
  '_eg_pages_v_blocks_hero',
  '_eg_pages_v_blocks_image_text',
  '_eg_pages_v_blocks_loop',
  '_eg_pages_v_blocks_product_grid',
  '_eg_pages_v_blocks_rich_text',
  '_eg_pages_v_blocks_section',
  '_eg_pages_v_rels',
  '_eg_posts_v',
  '_eg_posts_v_blocks_cta_banner',
  '_eg_posts_v_blocks_element',
  '_eg_posts_v_blocks_event_grid',
  '_eg_posts_v_blocks_faq',
  '_eg_posts_v_blocks_form',
  '_eg_posts_v_blocks_gallery',
  '_eg_posts_v_blocks_hero',
  '_eg_posts_v_blocks_image_text',
  '_eg_posts_v_blocks_loop',
  '_eg_posts_v_blocks_product_grid',
  '_eg_posts_v_blocks_rich_text',
  '_eg_posts_v_blocks_section',
  '_eg_posts_v_rels',
  '_eg_posts_v_version_categories',
  '_eg_products_v',
  '_eg_products_v_blocks_cta_banner',
  '_eg_products_v_blocks_element',
  '_eg_products_v_blocks_event_grid',
  '_eg_products_v_blocks_faq',
  '_eg_products_v_blocks_form',
  '_eg_products_v_blocks_gallery',
  '_eg_products_v_blocks_hero',
  '_eg_products_v_blocks_image_text',
  '_eg_products_v_blocks_loop',
  '_eg_products_v_blocks_product_grid',
  '_eg_products_v_blocks_rich_text',
  '_eg_products_v_blocks_section',
  '_eg_products_v_rels',
  'eg_ab_events',
  'eg_ab_stats',
  'eg_ab_tests',
  'eg_ab_tests_goals',
  'eg_ab_tests_variants',
  'eg_addresses',
  'eg_audit_log',
  'eg_backup_settings',
  'eg_backups',
  'eg_blog_settings',
  'eg_blog_settings_blocks_cta_banner',
  'eg_blog_settings_blocks_element',
  'eg_blog_settings_blocks_event_grid',
  'eg_blog_settings_blocks_faq',
  'eg_blog_settings_blocks_form',
  'eg_blog_settings_blocks_gallery',
  'eg_blog_settings_blocks_hero',
  'eg_blog_settings_blocks_image_text',
  'eg_blog_settings_blocks_loop',
  'eg_blog_settings_blocks_product_grid',
  'eg_blog_settings_blocks_rich_text',
  'eg_blog_settings_blocks_section',
  'eg_blog_settings_rels',
  'eg_carts',
  'eg_carts_items',
  'eg_courses',
  'eg_email_settings',
  'eg_enrolments',
  'eg_event_rsvps',
  'eg_events',
  'eg_faq_settings',
  'eg_faq_settings_blocks_cta_banner',
  'eg_faq_settings_blocks_element',
  'eg_faq_settings_blocks_event_grid',
  'eg_faq_settings_blocks_faq',
  'eg_faq_settings_blocks_form',
  'eg_faq_settings_blocks_gallery',
  'eg_faq_settings_blocks_hero',
  'eg_faq_settings_blocks_image_text',
  'eg_faq_settings_blocks_loop',
  'eg_faq_settings_blocks_product_grid',
  'eg_faq_settings_blocks_rich_text',
  'eg_faq_settings_blocks_section',
  'eg_faq_settings_rels',
  'eg_faqs',
  'eg_field_groups',
  'eg_field_groups_fields',
  'eg_field_groups_fields_options',
  'eg_field_groups_target_collections',
  'eg_footer',
  'eg_footer_columns',
  'eg_footer_columns_links',
  'eg_footer_socials_links',
  'eg_form_settings',
  'eg_form_submissions',
  'eg_forms',
  'eg_forms_fields',
  'eg_forms_fields_conditional_rules',
  'eg_forms_fields_options',
  'eg_header',
  'eg_header_menu',
  'eg_header_menu_children',
  'eg_header_socials_links',
  'eg_integrations',
  'eg_kv',
  'eg_language_settings',
  'eg_language_settings_multilingual_active_locales',
  'eg_lesson_progress',
  'eg_lessons',
  'eg_lessons_blocks_cta_banner',
  'eg_lessons_blocks_element',
  'eg_lessons_blocks_event_grid',
  'eg_lessons_blocks_faq',
  'eg_lessons_blocks_form',
  'eg_lessons_blocks_gallery',
  'eg_lessons_blocks_hero',
  'eg_lessons_blocks_image_text',
  'eg_lessons_blocks_loop',
  'eg_lessons_blocks_product_grid',
  'eg_lessons_blocks_rich_text',
  'eg_lessons_blocks_section',
  'eg_lessons_rels',
  'eg_lessons_resources',
  'eg_locked_documents',
  'eg_locked_documents_rels',
  'eg_media',
  'eg_media_settings',
  'eg_media_settings_resizing_responsive_widths',
  'eg_member_settings',
  'eg_membership_tiers',
  'eg_membership_tiers_benefits',
  'eg_memberships',
  'eg_migrations',
  'eg_navigation',
  'eg_navigation_items',
  'eg_orders',
  'eg_orders_items',
  'eg_orders_rels',
  'eg_page_templates',
  'eg_page_templates_blocks_cta_banner',
  'eg_page_templates_blocks_element',
  'eg_page_templates_blocks_event_grid',
  'eg_page_templates_blocks_faq',
  'eg_page_templates_blocks_form',
  'eg_page_templates_blocks_gallery',
  'eg_page_templates_blocks_hero',
  'eg_page_templates_blocks_image_text',
  'eg_page_templates_blocks_loop',
  'eg_page_templates_blocks_product_grid',
  'eg_page_templates_blocks_rich_text',
  'eg_page_templates_blocks_section',
  'eg_page_templates_rels',
  'eg_pages',
  'eg_pages_blocks_cta_banner',
  'eg_pages_blocks_element',
  'eg_pages_blocks_event_grid',
  'eg_pages_blocks_faq',
  'eg_pages_blocks_form',
  'eg_pages_blocks_gallery',
  'eg_pages_blocks_hero',
  'eg_pages_blocks_image_text',
  'eg_pages_blocks_loop',
  'eg_pages_blocks_product_grid',
  'eg_pages_blocks_rich_text',
  'eg_pages_blocks_section',
  'eg_pages_rels',
  'eg_payment_settings',
  'eg_posts',
  'eg_posts_blocks_cta_banner',
  'eg_posts_blocks_element',
  'eg_posts_blocks_event_grid',
  'eg_posts_blocks_faq',
  'eg_posts_blocks_form',
  'eg_posts_blocks_gallery',
  'eg_posts_blocks_hero',
  'eg_posts_blocks_image_text',
  'eg_posts_blocks_loop',
  'eg_posts_blocks_product_grid',
  'eg_posts_blocks_rich_text',
  'eg_posts_blocks_section',
  'eg_posts_categories',
  'eg_posts_rels',
  'eg_preferences',
  'eg_preferences_rels',
  'eg_products',
  'eg_products_blocks_cta_banner',
  'eg_products_blocks_element',
  'eg_products_blocks_event_grid',
  'eg_products_blocks_faq',
  'eg_products_blocks_form',
  'eg_products_blocks_gallery',
  'eg_products_blocks_hero',
  'eg_products_blocks_image_text',
  'eg_products_blocks_loop',
  'eg_products_blocks_product_grid',
  'eg_products_blocks_rich_text',
  'eg_products_blocks_section',
  'eg_products_rels',
  'eg_security_settings',
  'eg_seo_settings',
  'eg_seo_settings_schema_same_as',
  'eg_shop_settings',
  'eg_shop_settings_blocks_cta_banner',
  'eg_shop_settings_blocks_element',
  'eg_shop_settings_blocks_event_grid',
  'eg_shop_settings_blocks_faq',
  'eg_shop_settings_blocks_form',
  'eg_shop_settings_blocks_gallery',
  'eg_shop_settings_blocks_hero',
  'eg_shop_settings_blocks_image_text',
  'eg_shop_settings_blocks_loop',
  'eg_shop_settings_blocks_product_grid',
  'eg_shop_settings_blocks_rich_text',
  'eg_shop_settings_blocks_section',
  'eg_shop_settings_rels',
  'eg_site_settings',
  'eg_site_settings_footer_social_links',
  'eg_speed_settings',
  'eg_speed_settings_advanced_preconnect_origins',
  'eg_speed_settings_advanced_prefetch_dns',
  'eg_transactions',
  'eg_transactions_items',
  'eg_translations',
  'eg_users',
  'eg_users_roles',
  'eg_users_sessions',
].sort()

describe('runInternalMigrate - literal table-set-equality proof (genuinely empty D1, no persistence)', () => {
  it(
    'produces exactly the 232-table set local dev has, no more and no fewer, after a fresh install',
    async () => {
      const proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
      try {
        const rawDb = proxy.env.D1

        const { errorCount } = await setupFreshInstall(rawDb)
        expect(errorCount).toBe(0)

        const result = await rawDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
        const actualTables = ((result.results ?? []) as { name: string }[])
          .map((row) => row.name)
          // `_cf_METADATA` is a Cloudflare-managed bookkeeping table that only
          // ever appears against a real/persisted D1, never this in-memory
          // proxy - it is not part of this project's own schema.
          .filter((name) => name !== '_cf_METADATA')
          .sort()

        const missing = EXPECTED_TABLES.filter((name) => !actualTables.includes(name))
        const unexpected = actualTables.filter((name) => !EXPECTED_TABLES.includes(name))

        expect(missing).toEqual([])
        expect(unexpected).toEqual([])
        expect(actualTables).toEqual(EXPECTED_TABLES)
      } finally {
        await proxy.dispose()
      }
    },
    60_000,
  )
})
