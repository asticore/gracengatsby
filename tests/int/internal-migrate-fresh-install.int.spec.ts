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
    for (const table of ['eg_users', 'eg_pages', 'eg_migrations', 'eg_forms', 'eg_posts_blocks_hero', 'eg_locked_documents_rels']) {
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

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)
})
