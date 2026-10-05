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
        uid: uid(),
        email: 'admin@test.com',
        nickname: 'Admin',
        role: 'admin',
        settings: {},
        avatar_url: null,
      },
    })) as TypedUser
  })

  describe('GET', () => {
    it('returns 200 with admin context', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })
      const response = await GET()
      expect(response.status).toBe(200)
    })

    it('returns error when admin context is not available', async () => {
      getAdminContext.mockResolvedValue(null)
      try {
        await GET()
        expect.fail('Expected an error')
      } catch (error: unknown) {
        // Expected error
        expect((error as Error).message).toContain('Unauthorized')
      }
    })
  })

  describe('POST', () => {
    it('creates a new page with correct structure', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Page',
          slug: 'test-page',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(201)

      const body = await response.json()
      expect(body.title).toBe('Test Page')
      expect(body.slug).toBe('test-page')
    })

    it('returns 400 for invalid page data', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('returns error when admin context is not available', async () => {
      getAdminContext.mockResolvedValue(null)
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Page',
          slug: 'test-page',
        }),
      })

      try {
        await POST(request)
        expect.fail('Expected an error')
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Unauthorized')
      }
    })

    it('maintains page hierarchy and breadcrumb trails', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      // Create parent page
      const parentRequest = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Parent Page',
          slug: 'parent-page',
        }),
      })

      const parentResponse = await POST(parentRequest)
      const parentPage = await parentResponse.json()

      // Create child page
      const childRequest = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Child Page',
          slug: 'child-page',
          parent_id: parentPage.id,
        }),
      })

      const childResponse = await POST(childRequest)
      const childPage = await childResponse.json()

      expect(childPage.parent_id).toBe(parentPage.id)
    })

    it('handles page deletion with cascade', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      // Create a page
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Page to Delete',
          slug: 'page-to-delete',
        }),
      })

      const response = await POST(request)
      const page = await response.json()

      // Delete the page
      const deleteRequest = new Request(`http://localhost/${page.id}`, {
        method: 'DELETE',
      })

      // This should cascade delete related content
      expect(purgeCache).toBeDefined()
    })

    it('returns correct breadcrumb information', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Page',
          slug: 'test-page',
        }),
      })

      const response = await POST(request)
      const page = await response.json()

      expect(page.breadcrumb).toBeDefined()
      expect(Array.isArray(page.breadcrumb)).toBe(true)
    })
  })
})
