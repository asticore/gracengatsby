// @vitest-environment node
// Custom fields v2 on a genuinely empty D1: the migration must create the new
// columns and table, keep the legacy nested table, and be safe to run twice.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

describe('custom fields v2 - fresh install', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let first: InternalMigrateResult
  let second: InternalMigrateResult

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((r) => r.name)
  }

  const tableNames = async (): Promise<string[]> => {
    const rows = await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
    return (rows.results as { name: string }[]).map((r) => r.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    first = await runInternalMigrate(proxy.env.D1, consoleLogger)
    second = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes the first run with zero errors', () => {
    expect(first.errorCount).toBe(0)
  })

  it('finishes the second run with zero errors (idempotent)', () => {
    expect(second.errorCount).toBe(0)
  })

  it('adds the definition and location columns to eg_field_groups', async () => {
    const columns = await columnsOf('eg_field_groups')
    expect(columns).toContain('definition')
    expect(columns).toContain('location')
    // The legacy nested table stays for compatibility.
    expect(await tableNames()).toContain('eg_field_groups_fields')
  })

  it('creates eg_custom_field_options for Options pages', async () => {
    expect(await tableNames()).toContain('eg_custom_field_options')
    const columns = await columnsOf('eg_custom_field_options')
    expect(columns).toEqual(expect.arrayContaining(['slug', 'values', 'updated_at']))
  })

  it('keeps customFields on the content collections', async () => {
    for (const table of ['eg_pages', 'eg_posts', 'eg_events', 'eg_faqs', 'eg_products']) {
      const columns = await columnsOf(table)
      expect(columns, `${table} should keep custom_fields`).toContain('custom_fields')
    }
  })
})
