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

  it('is safe to run a second time', async () => {
    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
  }, 300_000)
})
