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
    for (const table of ['eg_users', 'eg_pages', 'eg_migrations', 'eg_forms', 'eg_posts_blocks_hero', 'eg_locked_documents_rels', 'eg_roles']) {
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

  it('creates custom keys child table for integrations', () => {
    expect(tables, 'eg_integrations_custom_keys table should be created').toContain('eg_integrations_custom_keys')
  })

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)
})