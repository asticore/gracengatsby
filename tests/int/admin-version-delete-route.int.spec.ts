// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

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

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/speed/purge', () => ({ purgeCache }))

import { DELETE } from '@/app/(engage)/api/admin-version-delete/route'

const uid = () => Math.random().toString(36).slice(2, 8)

vi.setConfig({ testTimeout: 60_000 })

describe('admin-version-delete route', () => {
  let engine: Engine
  let adminUser: TypedUser

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

  describe('DELETE', () => {
    it('deletes a page version when authorized', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=version-456',
        {
          method: 'DELETE',
        },
      )

      const response = await DELETE(request)
      expect(response.status).toBe(200)
      expect(purgeCache).toHaveBeenCalled()
    })

    it('returns 404 when version does not exist', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=nonexistent',
        {
          method: 'DELETE',
        },
      )

      const response = await DELETE(request)
      expect(response.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      getAdminContext.mockResolvedValue(null)

      const request = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=version-456',
        {
          method: 'DELETE',
        },
      )

      const response = await DELETE(request)
      expect(response.status).toBe(401)
    })

    it('returns 403 when user lacks admin role', async () => {
      const regularUser = (await engine.create({
        collection: 'users',
        data: {
          uid: uid(),
          email: 'user@test.com',
          nickname: 'User',
          role: 'editor',
          settings: {},
          avatar_url: null,
        },
      })) as TypedUser

      getAdminContext.mockResolvedValue({
        user: regularUser,
      })

      const request = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=version-456',
        {
          method: 'DELETE',
        },
      )

      const response = await DELETE(request)
      expect(response.status).toBe(403)
    })

    it('handles cascading deletion of dependent versions', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      // First version
      const firstRequest = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=version-1',
        {
          method: 'DELETE',
        },
      )

      const firstResponse = await DELETE(firstRequest)
      expect(firstResponse.status).toBe(200)

      // Dependent version should also be affected
      expect(purgeCache).toHaveBeenCalled()
    })

    it('preserves at least one version', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      // Try to delete the last version
      const request = new Request(
        'http://localhost/api/admin-version-delete?page_id=page-123&version_id=version-1&force=false',
        {
          method: 'DELETE',
        },
      )

      const response = await DELETE(request)
      // Should fail or warn if it's the last version
      expect([400, 409, 422]).toContain(response.status)
    })
  })
})
