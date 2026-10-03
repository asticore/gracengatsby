// @vitest-environment node
/**
 * Integration test for src/cms/db/versionDelete.ts against a real engine
 * and a real empty in-memory D1 database.
 *
 * Tests deleteVersionRow() and isVersionedCollection() with real versioned
 * pages and the actual version history mechanism.
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
import { deleteVersionRow, isVersionedCollection, type VersionedCollection } from '@/cms/db/versionDelete'
import { findPageVersions } from '@/cms/db/collections/pages'
import type { TypedUser } from '@/engine'

const REAL_MIGRATIONS = migrations as unknown as MigrationEntry[]

describe('version-delete with real engine and fresh D1', () => {
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
    // Clean up pages before each test
    const all = await engine.find({
      collection: 'pages',
      where: { slug: { like: 'test-page-%' } },
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

  it('isVersionedCollection returns true for versioned collections', async () => {
    expect(isVersionedCollection('pages')).toBe(true)
    expect(isVersionedCollection('posts')).toBe(true)
    expect(isVersionedCollection('events')).toBe(true)
    expect(isVersionedCollection('courses')).toBe(true)
    expect(isVersionedCollection('products')).toBe(true)
  })

  it('isVersionedCollection returns false for non-versioned collections', async () => {
    expect(isVersionedCollection('users')).toBe(false)
    expect(isVersionedCollection('media')).toBe(false)
    expect(isVersionedCollection('constructor')).toBe(false)
    expect(isVersionedCollection('nonexistent')).toBe(false)
  })

  it('deleting unknown version id returns not_found', async () => {
    const result = await deleteVersionRow('pages', 999999)
    expect(result).toBe('not_found')
  })

  it('deleting the latest version row returns is_latest', async () => {
    // Create a page via engine
    const page = await engine.create({
      collection: 'pages',
      data: {
        title: 'Page A',
        slug: `test-page-${Date.now()}-a`,
        _status: 'published',
      },
      overrideAccess: true,
    }) as unknown as { id: number }

    // Get versions - should have exactly one (the live/latest)
    const versions = await findPageVersions(page.id)
    expect(versions).toHaveLength(1)
    const latestVersion = versions[0]
    expect(latestVersion.latest).toBe(true)

    // Try to delete the latest version
    const result = await deleteVersionRow('pages', latestVersion.id)
    expect(result).toBe('is_latest')

    // Verify the version row still exists
    const versionsAfter = await findPageVersions(page.id)
    expect(versionsAfter).toHaveLength(1)
  })

  it(
    'deleting an older version row with correct parent returns deleted',
    async () => {
      // Create a page via engine
      const page = await engine.create({
        collection: 'pages',
        data: {
          title: 'Page B',
          slug: `test-page-${Date.now()}-b`,
          _status: 'published',
        },
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update the page twice to create 3 version rows total
      await engine.update({
        collection: 'pages',
        id: page.id,
        data: { title: 'Page B Updated 1' },
        overrideAccess: true,
      })

      await engine.update({
        collection: 'pages',
        id: page.id,
        data: { title: 'Page B Updated 2' },
        overrideAccess: true,
      })

      // Get all versions
      const versions = await findPageVersions(page.id)
      expect(versions.length).toBeGreaterThanOrEqual(3)

      // Find an older non-latest version
      const oldVersion = versions.find((v) => !v.latest)
      expect(oldVersion).toBeDefined()

      const versionIdToDelete = oldVersion!.id
      const beforeDelete = versions.length

      // Delete the old version with correct parent
      const result = await deleteVersionRow('pages', versionIdToDelete, page.id)
      expect(result).toBe('deleted')

      // Verify the version row is gone
      const versionsAfter = await findPageVersions(page.id)
      expect(versionsAfter.length).toBe(beforeDelete - 1)
      expect(versionsAfter.find((v) => v.id === versionIdToDelete)).toBeUndefined()
    },
    15000,
  )

  it(
    'deleting with wrong parent id returns wrong_parent',
    async () => {
      // Create two pages via engine
      const pageA = await engine.create({
        collection: 'pages',
        data: {
          title: 'Page A',
          slug: `test-page-${Date.now()}-c`,
          _status: 'published',
        },
        overrideAccess: true,
      }) as unknown as { id: number }

      const pageB = await engine.create({
        collection: 'pages',
        data: {
          title: 'Page B',
          slug: `test-page-${Date.now()}-d`,
          _status: 'published',
        },
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update page A to create an older version
      await engine.update({
        collection: 'pages',
        id: pageA.id,
        data: { title: 'Page A Updated' },
        overrideAccess: true,
      })

      // Get a version from page A
      const versionsA = await findPageVersions(pageA.id)
      const oldVersionA = versionsA.find((v) => !v.latest)
      expect(oldVersionA).toBeDefined()

      // Try to delete page A's version but claim it belongs to page B
      const result = await deleteVersionRow('pages', oldVersionA!.id, pageB.id)
      expect(result).toBe('wrong_parent')

      // Verify the version row still exists
      const versionsAAfter = await findPageVersions(pageA.id)
      expect(versionsAAfter.find((v) => v.id === oldVersionA!.id)).toBeDefined()
    },
    10000,
  )

  it(
    'deleting an older version without specifying parent succeeds',
    async () => {
      // Create a page via engine
      const page = await engine.create({
        collection: 'pages',
        data: {
          title: 'Page C',
          slug: `test-page-${Date.now()}-e`,
          _status: 'published',
        },
        overrideAccess: true,
      }) as unknown as { id: number }

      // Update the page to create an older version
      await engine.update({
        collection: 'pages',
        id: page.id,
        data: { title: 'Page C Updated' },
        overrideAccess: true,
      })

      const versions = await findPageVersions(page.id)
      const oldVersion = versions.find((v) => !v.latest)
      expect(oldVersion).toBeDefined()

      // Delete without specifying parent - should succeed
      const result = await deleteVersionRow('pages', oldVersion!.id)
      expect(result).toBe('deleted')

      // Verify the version row is gone
      const versionsAfter = await findPageVersions(page.id)
      expect(versionsAfter.find((v) => v.id === oldVersion!.id)).toBeUndefined()
    },
    10000,
  )
})
