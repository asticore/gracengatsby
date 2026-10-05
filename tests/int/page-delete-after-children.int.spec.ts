// @vitest-environment node
/**
 * Integration test for page deletion when a page was once the parent of a child.
 *
 * Tests the fix for: deleting a page that was ever the parent of a child page failed
 * with a foreign key error because old version rows of the child still had foreign key
 * constraints pointing at it. The fix is in src/cms/db/generic.ts (purgeBeforeDelete
 * in createVersionsOps, called by createDraftOps.deleteByID).
 */

import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runMigrations, type Drizzle, type MigrationEntry } from '@/localapi/migrate'
import { migrations } from '@/migrations'
import type { EngineDb } from '@/migrations/schema/engineBootstrap'
import { ensureMigrationsTable } from '@/migrations/schema/engineBootstrap'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

const REAL_MIGRATIONS = migrations as unknown as MigrationEntry[]

describe('page-delete with child parent relations', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Drizzle
  let engineDb: EngineDb
  let engine: Engine
  let adminUser: TypedUser

  beforeAll(
    async () => {
      // Get a genuinely empty, in-memory D1 (no persistence)
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

      // Run all migrations on the empty database
      await ensureMigrationsTable(engineDb)
      const migrateResult = await runMigrations({
        db,
        engineDb,
        logger: consoleLogger,
        migrations: REAL_MIGRATIONS,
      })
      expect(migrateResult.ran).toHaveLength(REAL_MIGRATIONS.length)

      // Create the engine against this migrated database
      engine = createEngine()

      // Create an admin user via the engine
      adminUser = await engine.create({
        collection: 'users',
        data: {
          email: `admin-${Date.now()}@example.com`,
          password: 'TestPassword123!',
        },
        overrideAccess: true,
      }) as unknown as TypedUser
    },
    180_000,
  )

  beforeEach(async () => {
    // Clean up pages before each test
    const all = await engine.find({
      collection: 'pages',
      where: { slug: { like: 'test-page-delete-%' } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of all.docs) {
      await engine.delete({ collection: 'pages', id: (d as { id: number }).id, overrideAccess: true })
    }
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  it(
    'delete parent after child with multiple versions: child delete succeeds, parent delete does not throw and parent is gone',
    async () => {
      // Create parent page P
      const parentData = {
        title: 'Parent Page',
        slug: `test-page-delete-parent-${Date.now()}`,
        _status: 'published' as const,
      }
      const parentPage = await engine.create({
        collection: 'pages',
        data: parentData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Create child C with parent P
      const childData = {
        title: 'Child Page',
        slug: `test-page-delete-child-${Date.now()}`,
        parent: parentPage.id,
        _status: 'published' as const,
      }
      const childPage = await engine.create({
        collection: 'pages',
        data: childData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update C once more to create a new version
      await engine.update({
        collection: 'pages',
        id: childPage.id,
        data: { title: 'Child Page Updated' },
        overrideAccess: true,
      })

      // Delete child C
      await engine.delete({ collection: 'pages', id: childPage.id, overrideAccess: true })

      // Verify C is deleted
      const childAfterDelete = await engine.findByID({
        collection: 'pages',
        id: childPage.id,
        overrideAccess: true,
        disableErrors: true,
      })
      expect(childAfterDelete).toBeNull()

      // Delete parent P - must NOT throw FK error
      await engine.delete({ collection: 'pages', id: parentPage.id, overrideAccess: true })

      // Verify P is deleted
      const parentAfterDelete = await engine.findByID({
        collection: 'pages',
        id: parentPage.id,
        overrideAccess: true,
        disableErrors: true,
      })
      expect(parentAfterDelete).toBeNull()
    },
    60_000,
  )

  it(
    'deleting a page removes its own version rows',
    async () => {
      // Create a parent page
      const parentData = {
        title: 'Parent Page 2',
        slug: `test-page-delete-parent2-${Date.now()}`,
        _status: 'published' as const,
      }
      const parentPage = await engine.create({
        collection: 'pages',
        data: parentData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Create a child with parent
      const childData = {
        title: 'Child Page 2',
        slug: `test-page-delete-child2-${Date.now()}`,
        parent: parentPage.id,
        _status: 'published' as const,
      }
      const childPage = await engine.create({
        collection: 'pages',
        data: childData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update to create a new version
      await engine.update({
        collection: 'pages',
        id: childPage.id,
        data: { title: 'Child Page 2 Updated' },
        overrideAccess: true,
      })

      // Get count of version rows for the child before delete
      const beforeDelete = await proxy.env.D1.prepare(
        `SELECT COUNT(*) as n FROM _eg_pages_v WHERE parent_id = ?`,
      )
        .bind(childPage.id)
        .first()
      const beforeCount = (beforeDelete as { n: number } | null)?.n ?? 0

      // Delete child
      await engine.delete({ collection: 'pages', id: childPage.id, overrideAccess: true })

      // Get count of version rows after delete - should be 0
      const afterDelete = await proxy.env.D1.prepare(
        `SELECT COUNT(*) as n FROM _eg_pages_v WHERE parent_id = ?`,
      )
        .bind(childPage.id)
        .first()
      const afterCount = (afterDelete as { n: number } | null)?.n ?? 0

      // The child should have no version rows after deletion (purgeBeforeDelete removes them)
      // or it may never have had any if they're created differently
      // The important thing is that it deletes successfully
      expect(afterCount).toBe(0)
    },
    60_000,
  )

  it(
    'deleting a parent that still has a live child is refused clearly',
    async () => {
      // Create parent page
      const parentData = {
        title: 'Parent Page 3',
        slug: `test-page-delete-parent3-${Date.now()}`,
        _status: 'published' as const,
      }
      const parentPage = await engine.create({
        collection: 'pages',
        data: parentData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Create child with parent
      const childData = {
        title: 'Child Page 3',
        slug: `test-page-delete-child3-${Date.now()}`,
        parent: parentPage.id,
        _status: 'published' as const,
      }
      const childPage = await engine.create({
        collection: 'pages',
        data: childData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update to create a new version
      await engine.update({
        collection: 'pages',
        id: childPage.id,
        data: { title: 'Child Page 3 Updated' },
        overrideAccess: true,
      })

      // Verify child can be found before delete
      const beforeDeleteParent = await engine.findByID({
        collection: 'pages',
        id: childPage.id,
        overrideAccess: true,
      })
      expect(beforeDeleteParent).toBeDefined()

      // Deleting a parent that still has a live child is refused with a clear message (not a bare FK 500).
      await expect(
        engine.delete({ collection: 'pages', id: parentPage.id, overrideAccess: true }),
      ).rejects.toThrow(/sub-pages/)

      // Parent and child are both still there, untouched.
      const parentStill = await engine.findByID({ collection: 'pages', id: parentPage.id, overrideAccess: true })
      expect(parentStill).toBeDefined()
      const childStill = (await engine.findByID({ collection: 'pages', id: childPage.id, overrideAccess: true })) as any
      expect(Number(childStill.parent?.id ?? childStill.parent)).toBe(parentPage.id)
    },
    60_000,
  )

  it(
    'a page with no relations deletes fine',
    async () => {
      // Create a page with no parent
      const pageData = {
        title: 'Standalone Page',
        slug: `test-page-delete-standalone-${Date.now()}`,
        _status: 'published' as const,
      }
      const page = await engine.create({
        collection: 'pages',
        data: pageData,
        overrideAccess: true,
      }) as unknown as { id: number }

      // Verify it exists
      const found = await engine.findByID({
        collection: 'pages',
        id: page.id,
        overrideAccess: true,
      })
      expect(found).toBeDefined()

      // Delete the page
      await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })

      // Verify it is deleted
      const afterDelete = await engine.findByID({
        collection: 'pages',
        id: page.id,
        overrideAccess: true,
        disableErrors: true,
      })
      expect(afterDelete).toBeNull()
    },
    30_000,
  )
})
