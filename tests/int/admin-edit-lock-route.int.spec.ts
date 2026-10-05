// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const { acquireEditLock, releaseEditLock } = vi.hoisted(() => ({
  acquireEditLock: vi.fn(),
  releaseEditLock: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/editLock', () => ({
  acquireEditLock,
  releaseEditLock,
}))

import { POST, DELETE } from '@/app/(engage)/api/admin-edit-lock/route'

const uid = () => Math.random().toString(36).slice(2, 8)

vi.setConfig({ testTimeout: 60_000 })

describe('admin-edit-lock route', () => {
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

  describe('POST - acquire edit lock', () => {
    it('acquires lock for authorized admin', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })
      acquireEditLock.mockResolvedValue({
        lock_id: 'lock-123',
        resource_id: 'page-456',
        user_id: adminUser.id,
        acquired_at: new Date().toISOString(),
      })

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: 'page-456',
          resource_type: 'page',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.lock_id).toBe('lock-123')
    })

    it('returns 409 when resource is already locked', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })
      acquireEditLock.mockRejectedValue(new Error('Resource already locked'))

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: 'page-456',
          resource_type: 'page',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(409)
    })

    it('returns 401 when not authenticated', async () => {
      getAdminContext.mockResolvedValue(null)

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: 'page-456',
          resource_type: 'page',
        }),
      })

      const response = await POST(request)
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

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: 'page-456',
          resource_type: 'page',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(403)
    })
  })

  describe('DELETE - release edit lock', () => {
    it('releases lock for authorized user', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })
      releaseEditLock.mockResolvedValue(true)

      const request = new Request('http://localhost?lock_id=lock-123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(200)
    })

    it('returns 404 when lock does not exist', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })
      releaseEditLock.mockRejectedValue(new Error('Lock not found'))

      const request = new Request('http://localhost?lock_id=nonexistent', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      getAdminContext.mockResolvedValue(null)

      const request = new Request('http://localhost?lock_id=lock-123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(401)
    })
  })
})
