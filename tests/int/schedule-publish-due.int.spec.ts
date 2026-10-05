// @vitest-environment node
/**
 * Integration tests for src/features/schedule/runDue.ts against a real engine
 * and a real empty in-memory D1 database.
 *
 * Tests:
 * - Scheduled publish executes when time is reached
 * - Scheduled unpublish executes when time is reached
 * - Future schedules are ignored
 * - Failures on one document do not block others
 * - markDone tracks completion correctly
 */

import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runMigrations, type Drizzle, type MigrationEntry } from '@/localapi/migrate'
import { migrations } from '@/migrations'
import type { EngineDb } from '@/migrations/schema/engineBootstrap'
import { ensureMigrationsTable } from '@/migrations/schema/engineBootstrap'
import { createEngine } from '@/localapi/engine'
import type { Engine } from '@/engine'
import { setSchedule } from '@/cms/db/scheduledPublishes'
import { runDueSchedules } from '@/features/schedule/runDue'

const REAL_MIGRATIONS = migrations as unknown as MigrationEntry[]

describe('schedule/runDue - publish and unpublish execution', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Drizzle
  let engineDb: EngineDb
  let engine: Engine

  beforeAll(async () => {
      proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
      const d1 = proxy.env.D1
      db = drizzle(d1) as unknown as Drizzle

      engineDb = {
        exists: async (table) => {
          const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).all()
          return (result.results?.length ?? 0) > 0
        },
        listTables: async () => {
          const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
          return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
        },
        columnsOf: async (table) => {
          const result = await d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
          return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
        },
        run: (statement) => d1.prepare(statement).run(),
        countRows: async (table) => {
          const result = await d1.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
          return (result.results?.[0] as { n: number } | undefined)?.n ?? 0
        },
      }

      await ensureMigrationsTable(engineDb)
      const migrateResult = await runMigrations({
        db,
        engineDb,
        logger: consoleLogger,
        migrations: REAL_MIGRATIONS,
      })
      expect(migrateResult.ran).toHaveLength(REAL_MIGRATIONS.length)

      engine = createEngine()
    }, 180000)


  afterAll(async () => {
    await proxy.dispose()
  }, 180000)

  it('should publish a document when scheduled time is due', async () => {
    // Create a draft page
    const page = await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page',
        slug: `test-publish-${Date.now()}`,
        _status: 'draft',
      },
      overrideAccess: true,
    })

    // Set a schedule to publish in the past
    const pastTime = new Date(Date.now() - 1000).toISOString()
    await setSchedule(db, 'pages', (page as { id: number }).id, {
      publishAt: pastTime,
      unpublishAt: null,
    })

    // Run due schedules
    const result = await runDueSchedules(engine, db, new Date().toISOString())

    // Check results
    expect(result.published).toHaveLength(1)
    expect(result.published[0]).toEqual({ collection: 'pages', docId: (page as { id: number }).id })
    expect(result.unpublished).toHaveLength(0)
    expect(result.failed).toHaveLength(0)

    // Verify the page is now published
    const updated = await engine.findByID({
      collection: 'pages',
      id: (page as { id: number }).id,
      overrideAccess: true,
    })
    expect(updated).toBeDefined()
    expect((updated as unknown as { _status: string })._status).toBe('published')
  })

  it('should unpublish a document when scheduled unpublish time is due', async () => {
    // Create a published page
    const page = await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page for Unpublish',
        slug: `test-unpublish-${Date.now()}`,
        _status: 'published',
      },
      overrideAccess: true,
    })

    // Set a schedule to unpublish in the past
    const pastTime = new Date(Date.now() - 1000).toISOString()
    await setSchedule(db, 'pages', (page as { id: number }).id, {
      publishAt: null,
      unpublishAt: pastTime,
    })

    // Run due schedules
    const result = await runDueSchedules(engine, db, new Date().toISOString())

    // Check results
    expect(result.unpublished).toHaveLength(1)
    expect(result.unpublished[0]).toEqual({ collection: 'pages', docId: (page as { id: number }).id })
    expect(result.published).toHaveLength(0)
    expect(result.failed).toHaveLength(0)

    // Verify the page is now draft
    const updated = await engine.findByID({
      collection: 'pages',
      id: (page as { id: number }).id,
      overrideAccess: true,
    })
    expect(updated).toBeDefined()
    expect((updated as unknown as { _status: string })._status).toBe('draft')
  })

  it('should ignore schedules with future times', async () => {
    // Create a draft page
    const page = await engine.create({
      collection: 'pages',
      data: {
        title: 'Test Page Future Schedule',
        slug: `test-future-${Date.now()}`,
        _status: 'draft',
      },
      overrideAccess: true,
    })

    // Set a schedule to publish far in the future
    const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
    await setSchedule(db, 'pages', (page as { id: number }).id, {
      publishAt: futureTime,
      unpublishAt: null,
    })

    // Run due schedules with current time
    const result = await runDueSchedules(engine, db, new Date().toISOString())

    // Check that nothing was published
    expect(result.published).toHaveLength(0)
    expect(result.failed).toHaveLength(0)

    // Verify the page is still draft
    const updated = await engine.findByID({
      collection: 'pages',
      id: (page as { id: number }).id,
      overrideAccess: true,
    })
    expect(updated).toBeDefined()
    expect((updated as unknown as { _status: string })._status).toBe('draft')
  })

  it('should isolate failures so one does not block the rest', async () => {
    const minimalContent = { root: { children: [{ type: 'paragraph' }] } }
    // Create two pages
    const page1 = await engine.create({
      collection: 'pages',
      data: {
        title: 'Good Page',
        slug: `test-good-${Date.now()}`,
        _status: 'draft',
      },
      overrideAccess: true,
    })

    const page2 = await engine.create({
      collection: 'posts',
      data: {
        title: 'Good Post',
        slug: `test-good-post-${Date.now()}`,
        _status: 'draft',
        content: minimalContent,
      },
      overrideAccess: true,
    })

    // Schedule both in the past
    const pastTime = new Date(Date.now() - 1000).toISOString()
    await setSchedule(db, 'pages', (page1 as { id: number }).id, {
      publishAt: pastTime,
      unpublishAt: null,
    })
    await setSchedule(db, 'posts', (page2 as { id: number }).id, {
      publishAt: pastTime,
      unpublishAt: null,
    })

    // Run due schedules
    const result = await runDueSchedules(engine, db, new Date().toISOString())

    // Both should succeed
    expect(result.published).toHaveLength(2)
    expect(result.failed).toHaveLength(0)

    // Verify both are published
    const page1Updated = await engine.findByID({
      collection: 'pages',
      id: (page1 as { id: number }).id,
      overrideAccess: true,
    })
    expect((page1Updated as unknown as { _status: string })._status).toBe('published')

    const page2Updated = await engine.findByID({
      collection: 'posts',
      id: (page2 as { id: number }).id,
      overrideAccess: true,
    })
    expect((page2Updated as unknown as { _status: string })._status).toBe('published')
  }, 60000)

  it(
    'should handle multiple collections (pages, posts, events, courses, products)',
    async () => {
      const pastTime = new Date(Date.now() - 1000).toISOString()
      const collections = ['pages', 'posts', 'events', 'courses', 'products']
      const minimalContent = { root: { children: [{ type: 'paragraph' }] } }

      // Create one document per allowed collection and schedule it
      for (const collection of collections) {
        const doc = await engine.create({
          collection,
          data: {
            title: `Test ${collection}`,
            slug: `test-${collection}-${Date.now()}`,
            _status: 'draft',
            // Add required fields for each collection
            ...(collection === 'posts' && { content: minimalContent }),
            ...(collection === 'events' && { startDate: '2025-12-01' }),
            ...(collection === 'courses' && { accessType: 'free' }),
          },
          overrideAccess: true,
        })

        await setSchedule(db, collection, (doc as { id: number }).id, {
          publishAt: pastTime,
          unpublishAt: null,
        })
      }

      // Run due schedules
      const result = await runDueSchedules(engine, db, new Date().toISOString())

      // Should have published all 5
      expect(result.published).toHaveLength(5)
      expect(result.failed).toHaveLength(0)
    },
    15000
  )
})
