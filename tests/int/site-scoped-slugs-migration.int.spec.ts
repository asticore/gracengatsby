// @vitest-environment node
// The slug lookup indexes on posts and products are not unique, so the same slug can live on two domains
// (migration 20261220_100000_site_scoped_slugs). Runs the real migrations on an empty D1, then again to prove idempotence.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'

type Index = { name: string; unique: number }

describe('site-scoped slugs migration', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let first: InternalMigrateResult
  let second: InternalMigrateResult

  const slugIndexes = async (table: string): Promise<Index[]> => {
    const rows = await proxy.env.D1.prepare(`PRAGMA index_list(\`${table}\`)`).all()
    const list = rows.results as Index[]
    const withSlug: Index[] = []
    for (const index of list) {
      const cols = (await proxy.env.D1.prepare(`PRAGMA index_info(\`${index.name}\`)`).all()).results as { name: string }[]
      if (cols.some((c) => c.name === 'slug')) withSlug.push(index)
    }
    return withSlug
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    first = await runInternalMigrate(proxy.env.D1, consoleLogger)
    second = await runInternalMigrate(proxy.env.D1, consoleLogger)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('both runs finish with zero errors', () => {
    expect(first.errorCount).toBe(0)
    expect(second.errorCount).toBe(0)
  })

  it('posts and products have no unique index on the slug, so a slug can repeat across domains', async () => {
    for (const table of ['eg_posts', 'eg_products']) {
      const indexes = await slugIndexes(table)
      expect(indexes.filter((i) => i.unique === 1), table).toEqual([])
    }
  })

  it('the last recorded migration is the last one registered, and this migration is recorded', async () => {
    const { migrations } = await import('@/migrations/index')
    const rows = await proxy.env.D1.prepare(`SELECT name FROM eg_migrations ORDER BY id DESC LIMIT 1`).all()
    expect((rows.results as { name: string }[])[0]?.name).toBe(migrations.at(-1)?.name)
    const mine = await proxy.env.D1.prepare(`SELECT COUNT(*) AS n FROM eg_migrations WHERE name = '20261220_100000_site_scoped_slugs'`).first<{ n: number }>()
    expect(mine?.n).toBe(1)
  })
})
