// @vitest-environment node
// Template repositories on a genuinely empty D1: runInternalMigrate alone must add the
// templateRepos group's columns and the repository child table, and a second run
// must change nothing and fail nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { getTableColumns, getTableName } from 'drizzle-orm'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'
import { integrationsGenerated } from '@/cms/db/schema/index'

const CHILD_COLUMNS = ['_order', '_parent_id', 'id', 'label', 'owner', 'repo', 'branch', 'path', 'enabled']

describe('template repositories - fresh install on an empty D1', () => {
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

  it('adds the group columns to eg_integrations', async () => {
    const columns = await columnsOf('eg_integrations')
    expect(columns).toContain('template_repos_enabled')
    expect(columns).toContain('template_repos_token')
  })

  it('creates the repository child table with the generated shape', async () => {
    const tables = (await proxy.env.D1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()).results as { name: string }[]
    expect(tables.map((t) => t.name)).toContain('eg_integrations_template_repos_repos')
    const columns = await columnsOf('eg_integrations_template_repos_repos')
    for (const column of CHILD_COLUMNS) expect(columns, column).toContain(column)
  })

  it('has every column the generated drizzle schema expects for eg_integrations', async () => {
    const generated = Object.values(getTableColumns(integrationsGenerated.table)).map((column) => column.name)
    const columns = await columnsOf(getTableName(integrationsGenerated.table))
    expect(generated.filter((name) => !columns.includes(name))).toEqual([])
  })

  it('names the child table the way the schema generator does', () => {
    expect(getTableName(integrationsGenerated.table)).toBe('eg_integrations')
    // generateArrayTable: <parent>_<group prefix><field>
    expect(`${getTableName(integrationsGenerated.table)}_template_repos_repos`).toBe('eg_integrations_template_repos_repos')
  })

  it('stores a repository row with its defaults', async () => {
    await proxy.env.D1.prepare(`INSERT INTO eg_integrations (created_at, updated_at) VALUES (datetime('now'), datetime('now'))`).run()
    const parent = await proxy.env.D1.prepare(`SELECT id FROM eg_integrations LIMIT 1`).first<{ id: number }>()
    await proxy.env.D1.prepare(
      `INSERT INTO eg_integrations_template_repos_repos (_order, _parent_id, id, owner, repo) VALUES (1, ?, 'a1', 'acme', 'templates')`,
    )
      .bind(parent!.id)
      .run()
    const row = await proxy.env.D1.prepare(`SELECT branch, path, enabled FROM eg_integrations_template_repos_repos WHERE id='a1'`).first<{
      branch: string
      path: string
      enabled: number
    }>()
    expect(row).toEqual({ branch: 'main', path: '', enabled: 1 })
    const flag = await proxy.env.D1.prepare(`SELECT template_repos_enabled AS e FROM eg_integrations LIMIT 1`).first<{ e: number }>()
    expect(flag!.e).toBe(0)
  })
})
