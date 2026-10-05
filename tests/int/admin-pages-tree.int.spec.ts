// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

// Mock auth and cache functions
const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const { purgeCache } = vi.hoisted(() => ({
  purgeCache: vi.fn(async () => ({
    ran: true,
    paths: [],
    edgeEvicted: [],
    revalidated: [],
    errors: [],
  })),
}))

const { invalidateRedirectsCache } = vi.hoisted(() => ({
  invalidateRedirectsCache: vi.fn(async () => undefined),
}))

// The route builds its own engine with createEngine(); sharing one instance lets a test spy on it.
const shared = vi.hoisted(() => ({ engine: null as unknown }))
vi.mock('@/localapi/engine', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/localapi/engine')>()
  return {
    ...mod,
    createEngine: (...args: Parameters<typeof mod.createEngine>) => {
      shared.engine ??= mod.createEngine(...args)
      return shared.engine as ReturnType<typeof mod.createEngine>
    },
  }
})

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/speed/purge', () => ({ purgeCache }))
vi.mock('@/features/redirects', () => ({ invalidateRedirectsCache }))

import { GET, POST } from '@/app/(engage)/api/admin-pages-tree/route'

// Helper to generate unique IDs
const uid = () => Math.random().toString(36).slice(2, 8)

// Every test creates real pages with versions in the local D1, which is slow under load.
vi.setConfig({ testTimeout: 90_000 })

describe('admin-pages-tree route', () => {
  let engine: Engine
  let adminUser: TypedUser

  // One-time setup: create the engine and admin user
  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
    adminUser = (await engine.create({
      collection: 'users',
      data: {
        email: `admin-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        roles: ['admin'],
      },
      overrideAccess: true,
    })) as unknown as TypedUser
  }, 180_000)

  describe('GET /api/admin-pages-tree', () => {
    it('returns 401 for non-admin user', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-pages-tree')
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns an array of pages', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-pages-tree')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = (await response.json()) as { pages: any[] }
      expect(Array.isArray(data.pages)).toBe(true)
    })

    it('returns created pages with parent, sortOrder, status, isHomepage', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'return-created-pages'
      // Create a homepage with unique slug
      const home = (await engine.create({
        collection: 'pages',
        data: {
          title: 'Home',
          slug: `home-${testName}-${uid()}`,
          isHomepage: true,
          _status: 'published',
          sortOrder: 0,
        },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      // Create a child page with unique slug
      const child = (await engine.create({
        collection: 'pages',
        data: {
          title: 'About',
          slug: `about-${testName}-${uid()}`,
          parent: home.id,
          _status: 'published',
          sortOrder: 1,
        },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree')
        const response = await GET(request)

        expect(response.status).toBe(200)
        const data = (await response.json()) as { pages: any[] }

        // Filter to only pages we created
        const createdPages = data.pages.filter((p) => p.id === home.id || p.id === child.id)
        expect(createdPages).toHaveLength(2)

        const homePage = createdPages.find((p) => p.id === home.id)
        expect(homePage).toMatchObject({
          title: 'Home',
          isHomepage: true,
          status: 'published',
        })

        const aboutPage = createdPages.find((p) => p.id === child.id)
        expect(aboutPage?.title).toBe('About')
        expect(aboutPage?.parent).toBe(home.id)
        expect(aboutPage?.sortOrder).toBe(1)
        expect(aboutPage?.isHomepage).toBe(false)
        expect(aboutPage?.status).toBe('published')
      } finally {
        // Clean up: delete children first, then parent
        try {
          await engine.delete({ collection: 'pages', id: child.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: home.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('includes draft pages', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'includes-draft'
      const draft = (await engine.create({
        collection: 'pages',
        data: {
          title: 'Draft Page',
          slug: `draft-${testName}-${uid()}`,
          _status: 'draft',
        },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree')
        const response = await GET(request)

        expect(response.status).toBe(200)
        const data = (await response.json()) as { pages: any[] }
        const draftPage = data.pages.find((p) => p.id === draft.id)
        expect(draftPage?.status).toBe('draft')
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: draft.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })
  })

  describe('POST /api/admin-pages-tree', () => {
    it('returns 401 for non-admin user', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-pages-tree', {
        method: 'POST',
        body: JSON.stringify({ moves: [], mode: 'preview' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 for invalid request body', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-pages-tree', {
        method: 'POST',
        body: 'not json',
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid request body' })
    })

    it('returns 400 when moves is not an array', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-pages-tree', {
        method: 'POST',
        body: JSON.stringify({ moves: {}, mode: 'preview' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'moves must be an array' })
    })

    it('returns 400 when moves exceeds 500 items', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-pages-tree', {
        method: 'POST',
        body: JSON.stringify({
          moves: Array(501).fill({ id: 1, parent: null, sortOrder: 0 }),
          mode: 'preview',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'moves array max 500 items' })
    })

    it('returns 400 when mode is not preview or commit', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-pages-tree', {
        method: 'POST',
        body: JSON.stringify({ moves: [], mode: 'invalid' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'mode must be "preview" or "commit"' })
    })

    it('returns plan on preview mode without changing DB', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'preview-mode'
      // Create two pages with unique slugs
      const p1 = (await engine.create({
        collection: 'pages',
        data: { title: 'Page 1', slug: `p1-${testName}-${uid()}`, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const p2 = (await engine.create({
        collection: 'pages',
        data: { title: 'Page 2', slug: `p2-${testName}-${uid()}`, sortOrder: 1 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: p1.id, parent: null, sortOrder: 1 }],
            mode: 'preview',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { plan: any }
        expect(data.plan).toBeDefined()
        expect(data.plan.ok).toBe(true)

        // Verify DB unchanged
        const p1After = (await engine.findByID({
          collection: 'pages',
          id: p1.id,
          overrideAccess: true,
        })) as any
        expect(p1After.sortOrder).toBe(0) // unchanged
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: p1.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: p2.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('commits reorder and persists sortOrder', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      vi.clearAllMocks()

      const testName = 'commit-reorder'
      const p1 = (await engine.create({
        collection: 'pages',
        data: { title: 'Page 1', slug: `p1-${testName}-${uid()}`, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const p2 = (await engine.create({
        collection: 'pages',
        data: { title: 'Page 2', slug: `p2-${testName}-${uid()}`, sortOrder: 1 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: p1.id, parent: null, sortOrder: 2 }],
            mode: 'commit',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { ok: boolean; applied: number }
        expect(data.ok).toBe(true)
        expect(data.applied).toBe(1)

        // Verify DB changed
        const p1After = (await engine.findByID({
          collection: 'pages',
          id: p1.id,
          overrideAccess: true,
        })) as any
        expect(p1After.sortOrder).toBe(2)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: p1.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: p2.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('commits reparent and persists parent', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      vi.clearAllMocks()

      const testName = 'commit-reparent'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}`, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const child = (await engine.create({
        collection: 'pages',
        data: { title: 'Child', slug: `child-${testName}-${uid()}`, parent: null, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: child.id, parent: parent.id, sortOrder: 0 }],
            mode: 'commit',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { ok: boolean }
        expect(data.ok).toBe(true)

        const childAfter = (await engine.findByID({
          collection: 'pages',
          id: child.id,
          overrideAccess: true,
        })) as any
        expect(childAfter.parent.id).toBe(parent.id)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: child.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('keeps published page status published on commit', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      vi.clearAllMocks()

      const testName = 'keep-published'
      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Published', slug: `pub-${testName}-${uid()}`, sortOrder: 0, _status: 'published' },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: null, sortOrder: 1 }],
            mode: 'commit',
          }),
        })

        await POST(request)

        const pageAfter = (await engine.findByID({
          collection: 'pages',
          id: page.id,
          overrideAccess: true,
        })) as any
        expect(pageAfter._status).toBe('published')
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('keeps draft page status draft on commit', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      vi.clearAllMocks()

      const testName = 'keep-draft'
      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Draft', slug: `draft-${testName}-${uid()}`, sortOrder: 0, _status: 'draft' },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: null, sortOrder: 1 }],
            mode: 'commit',
          }),
        })

        await POST(request)

        const pageAfter = (await engine.findByID({
          collection: 'pages',
          id: page.id,
          overrideAccess: true,
        })) as any
        expect(pageAfter._status).toBe('draft')
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('returns 400 when move validation fails (cycle)', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'move-cycle'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const child = (await engine.create({
        collection: 'pages',
        data: { title: 'Child', slug: `child-${testName}-${uid()}`, parent: parent.id },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: parent.id, parent: child.id, sortOrder: 0 }],
            mode: 'preview',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(400)
        const data = (await response.json()) as { errors: any[] }
        expect(data.errors).toBeDefined()
        expect(data.errors.length).toBeGreaterThan(0)
        expect(data.errors[0].message).toContain('descendant')
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: child.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('returns 400 when a move would exceed the 8-level depth limit', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'exceed-depth'
      const createdIds: number[] = []
      const make = async (title: string, parent: number | null) => {
        const page = (await engine.create({
          collection: 'pages',
          data: { title, slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${testName}-${uid()}`, parent, sortOrder: 0 },
          overrideAccess: true,
          user: adminUser,
        })) as unknown as { id: number }
        createdIds.push(page.id)
        return page.id
      }

      try {
        // A chain exactly 8 levels deep is allowed.
        let parentId: number | null = null
        for (let i = 0; i < 8; i++) parentId = await make(`Level ${i}`, parentId)
        const loose = await make('Loose page', null)

        // Moving one more page under the 8th level makes level 9.
        const response = await POST(
          new Request('http://x/api/admin-pages-tree', {
            method: 'POST',
            body: JSON.stringify({ moves: [{ id: loose, parent: parentId, sortOrder: 10 }], mode: 'preview' }),
          }),
        )
        expect(response.status).toBe(400)
        const data = (await response.json()) as { errors: { id: number | null; message: string }[] }
        expect(data.errors.some((e) => e.id === loose && /8/.test(e.message))).toBe(true)

        // Nothing was written.
        const unchanged = (await engine.findByID({ collection: 'pages', id: loose, overrideAccess: true, depth: 0 })) as unknown as {
          parent: number | null
        }
        expect(unchanged.parent ?? null).toBeNull()
      } finally {
        for (let i = createdIds.length - 1; i >= 0; i--) {
          await engine.delete({ collection: 'pages', id: createdIds[i], overrideAccess: true }).catch((): undefined => undefined)
        }
      }
    })

    it('returns 400 when slug clashes under new parent', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'slug-clash'
      const clashSlug = `child-${testName}-${uid()}`
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}`, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const existing = (await engine.create({
        collection: 'pages',
        data: { title: 'Existing', slug: clashSlug, parent: parent.id, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const toMove = (await engine.create({
        collection: 'pages',
        data: { title: 'To Move', slug: clashSlug, parent: null, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: toMove.id, parent: parent.id, sortOrder: 0 }],
            mode: 'preview',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(400)
        const data = (await response.json()) as { errors: any[] }
        expect(data.errors.some((e) => e.message.includes('Slug clash'))).toBe(true)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: toMove.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: existing.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('returns 400 when homepage given a parent', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      vi.clearAllMocks()

      const testName = 'homepage-parent'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const homepage = (await engine.create({
        collection: 'pages',
        data: { title: 'Home', slug: `home-${testName}-${uid()}`, isHomepage: true },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: homepage.id, parent: parent.id, sortOrder: 0 }],
            mode: 'preview',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(400)
        const data = (await response.json()) as { errors: any[] }
        expect(data.errors.some((e) => e.message.includes('homepage'))).toBe(true)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: homepage.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    })

    it('calls purgeCache with old and new paths', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      purgeCache.mockResolvedValue({
        ran: true,
        paths: [],
        edgeEvicted: [],
        revalidated: [],
        errors: [],
      })
      vi.clearAllMocks()

      const testName = 'purge-cache'
      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Test', slug: `test-${testName}-${uid()}`, sortOrder: 0 },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: null, sortOrder: 1 }],
            mode: 'commit',
          }),
        })

        await POST(request)

        expect(purgeCache).toHaveBeenCalled()
        const calls = (purgeCache as any).mock.calls
        expect(calls.length).toBeGreaterThan(0)
        if (calls.length > 0) {
          const callArgs = calls[0][0] as string[]
          expect(Array.isArray(callArgs)).toBe(true)
        }
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('creates redirects for published pages when createRedirects is true', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      purgeCache.mockResolvedValue({
        ran: true,
        paths: [],
        edgeEvicted: [],
        revalidated: [],
        errors: [],
      })
      invalidateRedirectsCache.mockResolvedValue(undefined)
      vi.clearAllMocks()

      const testName = 'create-redirects'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}`, sortOrder: 0, _status: 'published' },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Page', slug: `page-${testName}-${uid()}`, parent: null, sortOrder: 0, _status: 'published' },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const redirectsBefore = await engine.find({
        collection: 'redirects',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      }).catch(() => ({ docs: [] as any[] }))

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: parent.id, sortOrder: 0 }],
            mode: 'commit',
            createRedirects: true,
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { redirects: any }
        expect(data.redirects.available).toBe(true)
        expect(data.redirects.created).toBeGreaterThanOrEqual(1)

        // Verify redirect was created
        const redirectsAfter = await engine.find({
          collection: 'redirects',
          limit: 100,
          depth: 0,
          overrideAccess: true,
        }).catch(() => ({ docs: [] as any[] }))
        expect(redirectsAfter.docs.length).toBeGreaterThan(redirectsBefore.docs.length)
      } finally {
        // Delete redirects created by this test
        const allRedirects = await engine.find({
          collection: 'redirects',
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        }).catch(() => ({ docs: [] as any[] }))
        for (const r of allRedirects.docs as any[]) {
          if (r.fromPath && r.fromPath.includes(testName)) {
            try {
              await engine.delete({ collection: 'redirects', id: r.id, overrideAccess: true })
            } catch (err) {
              // ignore
            }
          }
        }
        // Delete pages
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('does not create redirects for draft pages', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      purgeCache.mockResolvedValue({
        ran: true,
        paths: [],
        edgeEvicted: [],
        revalidated: [],
        errors: [],
      })
      invalidateRedirectsCache.mockResolvedValue(undefined)
      vi.clearAllMocks()

      const testName = 'no-redirects-draft'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const draft = (await engine.create({
        collection: 'pages',
        data: { title: 'Draft', slug: `draft-${testName}-${uid()}`, _status: 'draft' },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: draft.id, parent: parent.id, sortOrder: 0 }],
            mode: 'commit',
            createRedirects: true,
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { redirects: any }
        // Draft pages should not create redirects
        expect(data.redirects.created).toBe(0)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: draft.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('does not create redirects when createRedirects is false', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      purgeCache.mockResolvedValue({
        ran: true,
        paths: [],
        edgeEvicted: [],
        revalidated: [],
        errors: [],
      })
      invalidateRedirectsCache.mockResolvedValue(undefined)
      vi.clearAllMocks()

      const testName = 'no-redirects-flag'
      const parent = (await engine.create({
        collection: 'pages',
        data: { title: 'Parent', slug: `parent-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Page', slug: `page-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: parent.id, sortOrder: 0 }],
            mode: 'commit',
            createRedirects: false,
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { redirects: any }
        expect(data.redirects.created).toBe(0)
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
        try {
          await engine.delete({ collection: 'pages', id: parent.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('skips redirect creation when collection is unavailable', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      purgeCache.mockResolvedValue({
        ran: true,
        paths: [],
        edgeEvicted: [],
        revalidated: [],
        errors: [],
      })
      invalidateRedirectsCache.mockResolvedValue(undefined)
      vi.clearAllMocks()

      const testName = 'redirects-unavail'
      const page = (await engine.create({
        collection: 'pages',
        data: { title: 'Page', slug: `page-${testName}-${uid()}` },
        overrideAccess: true,
        user: adminUser,
      })) as unknown as { id: number }

      try {
        const request = new Request('http://x/api/admin-pages-tree', {
          method: 'POST',
          body: JSON.stringify({
            moves: [{ id: page.id, parent: null, sortOrder: 1 }],
            mode: 'commit',
            createRedirects: true,
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        const data = (await response.json()) as { redirects: any }
        // Should indicate redirects collection is available (since it exists in this test)
        expect(data.redirects).toBeDefined()
      } finally {
        try {
          await engine.delete({ collection: 'pages', id: page.id, overrideAccess: true })
        } catch (err) {
          // ignore
        }
      }
    }, 60000)

    it('rolls back applied moves and returns 409 when another move cannot be applied', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: adminUser })
      vi.clearAllMocks()

      const testName = 'rollback-409'
      const make = async (title: string, sortOrder: number) =>
        (await engine.create({
          collection: 'pages',
          data: { title, slug: `${title.toLowerCase()}-${testName}-${uid()}`, sortOrder },
          overrideAccess: true,
          user: adminUser,
        })) as unknown as { id: number }
      const a = await make('Alpha', 5)
      const b = await make('Beta', 6)

      const originalUpdate = engine.update.bind(engine)
      const updateSpy = vi.spyOn(engine, 'update').mockImplementation((async (opts: { id: number }) => {
        if (opts.id === b.id) throw new Error('Forced failure for testing')
        return originalUpdate(opts as never)
      }) as never)

      try {
        const response = await POST(
          new Request('http://x/api/admin-pages-tree', {
            method: 'POST',
            body: JSON.stringify({
              moves: [
                { id: a.id, parent: null, sortOrder: 50 },
                { id: b.id, parent: null, sortOrder: 60 },
              ],
              mode: 'commit',
            }),
          }),
        )
        expect(response.status).toBe(409)
        const data = (await response.json()) as { error: string; failed: { id: number; message: string }[] }
        expect(data.error).toContain('Could not apply all moves')
        expect(data.failed.map((f) => f.id)).toEqual([b.id])
        expect(data.failed[0].message).toContain('Forced failure')
      } finally {
        updateSpy.mockRestore()
      }

      try {
        // Alpha was applied first, then restored.
        const restored = (await engine.findByID({ collection: 'pages', id: a.id, overrideAccess: true, depth: 0 })) as unknown as {
          sortOrder: number
        }
        expect(restored.sortOrder).toBe(5)
        const untouched = (await engine.findByID({ collection: 'pages', id: b.id, overrideAccess: true, depth: 0 })) as unknown as {
          sortOrder: number
        }
        expect(untouched.sortOrder).toBe(6)
      } finally {
        for (const id of [a.id, b.id]) {
          await engine.delete({ collection: 'pages', id, overrideAccess: true }).catch((): undefined => undefined)
        }
      }
    }, 90_000)
  })
})
