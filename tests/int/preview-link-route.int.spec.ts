// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))

import { POST, DELETE } from '@/app/(engage)/api/preview-link/route'

const uid = () => Math.random().toString(36).slice(2, 8)

vi.setConfig({ testTimeout: 60_000 })

describe('preview-link route', () => {
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

  describe('POST - create preview link', () => {
    it('creates a preview link for a page', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          page_id: 'page-123',
          expires_in: 3600, // 1 hour
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.preview_link).toBeDefined()
      expect(body.expires_at).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      getAdminContext.mockResolvedValue(null)

      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          page_id: 'page-123',
          expires_in: 3600,
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
    })
  })

  describe('DELETE - revoke preview link', () => {
    it('revokes a preview link', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost?link_id=link-123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(200)
    })

    it('returns 404 when link does not exist', async () => {
      getAdminContext.mockResolvedValue({
        user: adminUser,
      })

      const request = new Request('http://localhost?link_id=nonexistent', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(404)
    })
  })
})
