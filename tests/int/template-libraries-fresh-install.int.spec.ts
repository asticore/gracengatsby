// @vitest-environment node
// Template libraries on a genuinely empty D1: runInternalMigrate alone must create the global and its
// two child tables, a second run must change nothing, and existing template repositories must be
// copied into the library list (as GitHub addresses) the first time the migration runs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { getTableColumns, getTableName } from 'drizzle-orm'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'
import { templateLibrariesGenerated } from '@/cms/db/schema/templateLibraries'

const MIGRATION = '20270119_100000_template_libraries'

describe('template libraries - fresh install on an empty D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let first: InternalMigrateResult
  let second: InternalMigrateResult

  const columnsOf = async (table: string): Promise<string[]> => {
    const result = await proxy.env.D1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
    return (result.results as { name: string }[]).map((r) => r.name)
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    first = await runInternalMigrate(proxy.env.D1, consoleLogger)
    second = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes both runs with zero errors', () => {
    expect(first.errorCount).toBe(0)
    expect(second.errorCount).toBe(0)
  })

  it('creates the global table and both child tables', async () => {
    const tables = (await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()).results as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('eg_template_libraries')
    expect(names).toContain('eg_template_libraries_libraries')
    expect(names).toContain('eg_template_libraries_imports')
  })

  it('has every column the generated drizzle schema expects', async () => {
    const generated = Object.values(getTableColumns(templateLibrariesGenerated.table)).map((column) => column.name)
    const columns = await columnsOf(getTableName(templateLibrariesGenerated.table))
    expect(generated.filter((name) => !columns.includes(name))).toEqual([])
  })

  it('has the child columns the array fields generate', async () => {
    for (const column of ['_order', '_parent_id', 'id', 'label', 'url', 'enabled']) {
      expect(await columnsOf('eg_template_libraries_libraries'), column).toContain(column)
    }
    for (const column of ['_order', '_parent_id', 'id', 'sha256', 'media_id', 'source_url']) {
      expect(await columnsOf('eg_template_libraries_imports'), column).toContain(column)
    }
  })

  it('copies an existing template repository in as a GitHub address, once', async () => {
    // Simulate an install that had a repository before this migration ran.
    await proxy.env.D1.prepare(`INSERT OR IGNORE INTO eg_integrations (id, created_at, updated_at) VALUES (1, datetime('now'), datetime('now'))`).run()
    await proxy.env.D1.prepare(`UPDATE eg_integrations SET template_repos_enabled = 1`).run()
    await proxy.env.D1.prepare(
      `INSERT INTO eg_integrations_template_repos_repos (_order, _parent_id, id, label, owner, repo, branch, path, enabled) VALUES (1, 1, 'legacy1', 'Acme', 'acme', 'templates', 'main', 'site', 1), (2, 1, 'legacy2', 'Other', 'acme', 'other', 'dev', '', 1)`,
    ).run()
    await proxy.env.D1.prepare(`DELETE FROM eg_template_libraries_libraries`).run()
    await proxy.env.D1.prepare(`DELETE FROM eg_migrations WHERE name = ?`).bind(MIGRATION).run()

    const again = await runInternalMigrate(proxy.env.D1, consoleLogger)
    expect(again.errorCount).toBe(0)
    const rows = (await proxy.env.D1.prepare(`SELECT id, url, enabled FROM eg_template_libraries_libraries ORDER BY _order`).all()).results as Array<{
      id: string
      url: string
      enabled: number
    }>
    expect(rows).toEqual([
      { id: 'legacy1', url: 'https://github.com/acme/templates/tree/main/site', enabled: 1 },
      { id: 'legacy2', url: 'https://github.com/acme/other/tree/dev', enabled: 1 },
    ])

    // Running the migration again (the list is no longer empty) copies nothing more.
    await proxy.env.D1.prepare(`DELETE FROM eg_migrations WHERE name = ?`).bind(MIGRATION).run()
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    const count = await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM eg_template_libraries_libraries`).first<{ n: number }>()
    expect(count!.n).toBe(2)
  }, 300_000)

  it('switches copied rows off when the old master switch was off', async () => {
    await proxy.env.D1.prepare(`UPDATE eg_integrations SET template_repos_enabled = 0`).run()
    await proxy.env.D1.prepare(`DELETE FROM eg_template_libraries_libraries`).run()
    await proxy.env.D1.prepare(`DELETE FROM eg_migrations WHERE name = ?`).bind(MIGRATION).run()
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    const row = await proxy.env.D1.prepare(`SELECT enabled FROM eg_template_libraries_libraries WHERE id = 'legacy1'`).first<{ enabled: number }>()
    expect(row!.enabled).toBe(0)
  }, 300_000)
})
