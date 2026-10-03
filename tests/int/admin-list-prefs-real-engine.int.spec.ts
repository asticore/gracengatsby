// @vitest-environment node
/**
 * Integration test for src/admin/list/listPrefs.ts against a real engine
 * and a real empty in-memory D1 database.
 *
 * Proves that the preferences `user` field is polymorphic and must be queried
 * as 'user.relationTo'/'user.value' and created as {relationTo:'users', value:id}.
 * Existing mocks hid this bug; this test exercises the real engine flow.
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
import { loadListPrefs, saveListPrefs, resetListPrefs, type ListPrefs } from '@/admin/list/listPrefs'
import type { TypedUser } from '@/engine'

const REAL_MIGRATIONS = migrations as unknown as MigrationEntry[]

describe('admin-list-prefs with real engine and fresh D1', () => {
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
    60_000,
  )

  beforeEach(async () => {
    // The engine may be bound to a shared local D1, so start each test clean
    const all = await engine.find({
      collection: 'preferences',
      where: { key: { like: 'collection-' } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of all.docs) {
      await engine.delete({ collection: 'preferences', id: (d as { id: number }).id, overrideAccess: true })
    }
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  it('saveListPrefs creates a new preference document with polymorphic user field', async () => {
    const prefs: ListPrefs = {
      cols: ['title', 'slug'],
      sort: '-updatedAt',
      limit: 50,
      view: 'list',
    }

    const saved = await saveListPrefs(engine, adminUser, 'pages', prefs)
    expect(saved).toEqual(prefs)

    // Verify the document was created
    const found = await engine.find({
      collection: 'preferences',
      where: {
        key: { equals: 'collection-pages-list' },
      },
      depth: 0,
      user: adminUser,
      overrideAccess: true,
    })

    expect(found.docs).toHaveLength(1)
    const doc = found.docs[0] as any
    expect(doc.key).toBe('collection-pages-list')
    expect(doc.user).toEqual([adminUser.id])
    expect(doc.value).toEqual(prefs)
  })

  it('loadListPrefs retrieves the saved preferences', async () => {
    const prefs: ListPrefs = {
      cols: ['title', 'slug'],
      sort: '-updatedAt',
      limit: 50,
      view: 'list',
    }

    await saveListPrefs(engine, adminUser, 'pages', prefs)
    const loaded = await loadListPrefs(engine, adminUser, 'pages')

    expect(loaded).toEqual(prefs)
  })

  it('saveListPrefs merges with existing preferences', async () => {
    const prefs1: ListPrefs = {
      cols: ['title', 'slug'],
      sort: '-updatedAt',
      limit: 50,
      view: 'list',
    }

    await saveListPrefs(engine, adminUser, 'events', prefs1)

    // Save new prefs with only limit changed
    const prefs2: ListPrefs = { limit: 10 }
    const merged = await saveListPrefs(engine, adminUser, 'events', prefs2)

    // Should merge: cols and sort kept, limit updated
    expect(merged.cols).toEqual(['title', 'slug'])
    expect(merged.sort).toBe('-updatedAt')
    expect(merged.limit).toBe(10)
    expect(merged.view).toBe('list')

    // Verify only one row exists
    const found = await engine.find({
      collection: 'preferences',
      where: {
        key: { equals: 'collection-events-list' },
      },
      depth: 0,
      user: adminUser,
      overrideAccess: true,
    })

    expect(found.docs).toHaveLength(1)
  })

  it('resetListPrefs deletes the preferences document', async () => {
    const prefs: ListPrefs = {
      cols: ['id', 'title'],
      limit: 25,
    }

    await saveListPrefs(engine, adminUser, 'posts', prefs)

    const beforeReset = await loadListPrefs(engine, adminUser, 'posts')
    expect(beforeReset).toEqual(prefs)

    await resetListPrefs(engine, adminUser, 'posts')

    const afterReset = await loadListPrefs(engine, adminUser, 'posts')
    expect(afterReset).toEqual({})
  })

  it('loadListPrefs returns {} when no preferences exist', async () => {
    const loaded = await loadListPrefs(engine, adminUser, 'nonexistent-collection')
    expect(loaded).toEqual({})
  })

  it('different users have isolated preferences', async () => {
    // Create a second user
    const secondUser = await engine.create({
      collection: 'users',
      data: {
        email: `user2-${Date.now()}@example.com`,
        password: 'TestPassword123!',
      },
      overrideAccess: true,
    }) as unknown as TypedUser

    // First user saves preferences
    const prefs1: ListPrefs = {
      cols: ['title', 'slug'],
      limit: 50,
    }
    await saveListPrefs(engine, adminUser, 'products', prefs1)

    // Second user saves different preferences
    const prefs2: ListPrefs = {
      cols: ['id', 'name'],
      limit: 10,
    }
    await saveListPrefs(engine, secondUser, 'products', prefs2)

    // Each user sees only their own preferences
    const user1Prefs = await loadListPrefs(engine, adminUser, 'products')
    expect(user1Prefs).toEqual(prefs1)

    const user2Prefs = await loadListPrefs(engine, secondUser, 'products')
    expect(user2Prefs).toEqual(prefs2)
  })

  it('loadListPrefs returns {} when user is null', async () => {
    const loaded = await loadListPrefs(engine, null, 'pages')
    expect(loaded).toEqual({})
  })

  it('saveListPrefs returns {} when user is null', async () => {
    const saved = await saveListPrefs(engine, null, 'pages', { limit: 50 })
    expect(saved).toEqual({})
  })

  it('resetListPrefs does nothing when user is null', async () => {
    await expect(resetListPrefs(engine, null, 'pages')).resolves.toBeUndefined()
  })
})
