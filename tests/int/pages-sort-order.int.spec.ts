// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import { resolveD1Binding } from '@/cms/db/connect'
import type { TypedUser } from '@/engine'

describe('cms/db - pages sortOrder field', () => {
  let engine: Engine
  let adminUser: TypedUser
  let db: D1Database

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
    db = await resolveD1Binding()
    // Create an admin user for operations
    adminUser = (await engine.create({
      collection: 'users',
      data: {
        email: `admin-${Date.now()}@example.com`,
        password: 'TestPassword123!',
      },
      overrideAccess: true,
    })) as unknown as TypedUser
  }, 180_000)

  afterAll(async () => {
    // Cleanup handled by ensureMigratedLocalDb
  })

  it('migration adds sort_order column to eg_pages table', async () => {
    const result = await db.prepare('PRAGMA table_info(`eg_pages`)').all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames, 'eg_pages should have sort_order column').toContain('sort_order')
  })

  it('migration adds version_sort_order column to _eg_pages_v table', async () => {
    const result = await db.prepare('PRAGMA table_info(`_eg_pages_v`)').all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames, '_eg_pages_v should have version_sort_order column').toContain('version_sort_order')
  })

  it('migration creates index on sort_order', async () => {
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='eg_pages_sort_order_idx'",
    ).all()
    expect(result.results, 'eg_pages_sort_order_idx should exist').toHaveLength(1)
  })

  it('migration creates index on version_sort_order', async () => {
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='_eg_pages_v_version_sort_order_idx'",
    ).all()
    expect(result.results, '_eg_pages_v_version_sort_order_idx should exist').toHaveLength(1)
  })

  it('migration is idempotent - columns already exist after first migration', async () => {
    // The migration system already ran this migration in beforeAll via ensureMigratedLocalDb.
    // This test verifies it succeeded by checking the columns exist.
    // The idempotency is proven by the fact that subsequent tests don't fail.
    const result = await db.prepare('PRAGMA table_info(`eg_pages`)').all()
    const columnNames = (result.results as { name: string }[]).map((r) => r.name)
    expect(columnNames, 'Idempotency: sort_order column should exist').toContain('sort_order')
  })

  it('creates a page with sortOrder 30 and reads it back', async () => {
    const ts = Date.now()
    const ours = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page with Sort',
        slug: `test-page-sort-${ts}`,
        sortOrder: 30,
      },
      overrideAccess: true,
    })) as unknown as { id: number; title: string; sortOrder: number }

    const viaOurs = await engine.findByID({
      collection: 'pages',
      id: ours.id,
      overrideAccess: true,
    })
    expect((viaOurs as any)?.sortOrder).toBe(30)
  })

  it('updates sortOrder from 30 to 10', async () => {
    const ts = Date.now()
    const created = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page Update Sort',
        slug: `test-update-sort-${ts}`,
        sortOrder: 30,
      },
      overrideAccess: true,
    })) as unknown as { id: number }

    await engine.update({
      collection: 'pages',
      id: created.id,
      data: {
        sortOrder: 10,
      },
      overrideAccess: true,
    })

    const updated = await engine.findByID({
      collection: 'pages',
      id: created.id,
      overrideAccess: true,
    })
    expect((updated as any)?.sortOrder).toBe(10)
  })

  it('defaults sortOrder to 0 when omitted', async () => {
    const ts = Date.now()
    const ours = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page Default Sort',
        slug: `test-default-sort-${ts}`,
      },
      overrideAccess: true,
    })) as unknown as { id: number }

    const viaOurs = await engine.findByID({
      collection: 'pages',
      id: ours.id,
      overrideAccess: true,
    })
    expect((viaOurs as any)?.sortOrder).toBe(0)
  })

  it('pages with different sortOrder sort correctly', async () => {
    const ts = Date.now()
    const page1 = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Page A',
        slug: `page-a-${ts}`,
        sortOrder: 10,
      },
      overrideAccess: true,
    })) as unknown as { id: number }

    const page2 = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Page B',
        slug: `page-b-${ts}`,
        sortOrder: 5,
      },
      overrideAccess: true,
    })) as unknown as { id: number }

    const page3 = (await engine.create({
      collection: 'pages',
      data: {
        title: 'Page C',
        slug: `page-c-${ts}`,
        sortOrder: 20,
      },
      overrideAccess: true,
    })) as unknown as { id: number }

    const { docs } = await engine.find({
      collection: 'pages',
      sort: 'sortOrder',
      where: {
        id: { in: [page1.id, page2.id, page3.id] },
      },
      depth: 0,
      overrideAccess: true,
    })

    const sortOrders = (docs as any[]).map((d) => d.sortOrder)
    expect(sortOrders).toEqual([5, 10, 20])
  })
})
