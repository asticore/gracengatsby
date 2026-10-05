import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const editLocksMock = vi.hoisted(() => ({
  getLock: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  takeOver: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/cms/db/connect', () => ({
  getDb: vi.fn(async () => ({})),
}))
vi.mock('@/cms/db/editLocks', () => editLocksMock)

import { GET, POST } from '@/app/(engage)/api/admin-edit-lock/route'

describe('admin-edit-lock route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns 401 when user is not an admin', async () => {
      getAdminContext.mockResolvedValue({
        isAdmin: false, can: () => false,
        can: () => false,
      })

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=1')
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 when collection is invalid', async () => {
      getAdminContext.mockResolvedValue({
        isAdmin: true,
        can: () => false,
      })

      const request = new Request('http://x/api/admin-edit-lock?collection=unknown&id=1')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection or id' })
    })

    it('returns 400 when id is missing', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-edit-lock?collection=pages')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection or id' })
    })

    it('returns 400 when id is zero', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=0')
      const response = await GET(request)

      expect(response.status).toBe(400)
    })

    it('returns 400 when id is not an integer', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=abc')
      const response = await GET(request)

      expect(response.status).toBe(400)
    })

    it('returns {held: false} when no lock exists', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      editLocksMock.getLock.mockResolvedValue(null)

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=1')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const body = (await response.json()) as { held: boolean; by?: unknown }
      expect(body.held).toBe(false)
      expect(body.by).toBeUndefined()
    })

    it('returns {held: false, by: {...}} when another user holds lock', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      editLocksMock.getLock.mockResolvedValue({
        userId: 2,
        label: 'other@example.com',
      })

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=1')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        held: boolean
        by?: { userId: number; label: string }
      }
      expect(body).toEqual({
        held: false,
        by: { userId: 2, label: 'other@example.com' },
      })
    })

    it('sets no-store cache header', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      editLocksMock.getLock.mockResolvedValue(null)

      const request = new Request('http://x/api/admin-edit-lock?collection=pages&id=1')
      const response = await GET(request)

      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })
  })

  describe('POST', () => {
    it('returns 401 when user is not an admin', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'pages',
          id: 1,
          action: 'acquire',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 when collection is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: { id: 1, email: 'user@example.com' } })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'unknown',
          id: 1,
          action: 'acquire',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('returns 400 when id is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: { id: 1, email: 'user@example.com' } })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'pages',
          id: 0,
          action: 'acquire',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('returns 400 when action is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, user: { id: 1, email: 'user@example.com' } })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'pages',
          id: 1,
          action: 'invalid',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid action' })
    })

    describe('acquire action', () => {
      it('calls editLocks.acquire and returns {held: true}', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.acquire.mockResolvedValue({ held: true })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'acquire',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ held: true })
        expect(editLocksMock.acquire).toHaveBeenCalledWith(
          {},
          'pages',
          1,
          { userId: 1, label: 'user@example.com' }
        )
      })

      it('returns {held: false, by: {...}} when another user holds it', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.acquire.mockResolvedValue({
          held: false,
          by: { userId: 2, label: 'other@example.com' },
        })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'acquire',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          held: false,
          by: { userId: 2, label: 'other@example.com' },
        })
      })
    })

    describe('heartbeat action', () => {
      it('calls editLocks.acquire with the same args', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.acquire.mockResolvedValue({ held: true })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'heartbeat',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(editLocksMock.acquire).toHaveBeenCalledWith(
          {},
          'pages',
          1,
          { userId: 1, label: 'user@example.com' }
        )
      })
    })

    describe('release action', () => {
      it('returns 403 when user does not hold the lock', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.getLock.mockResolvedValue({
          userId: 2,
          label: 'other@example.com',
        })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'release',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'not_holder' })
        expect(editLocksMock.release).not.toHaveBeenCalled()
      })

      it('calls editLocks.release when user holds the lock', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.getLock.mockResolvedValue({
          userId: 1,
          label: 'user@example.com',
        })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'release',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ held: false })
        expect(editLocksMock.release).toHaveBeenCalledWith({}, 'pages', 1, 1)
      })

      it('allows release when no lock exists', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })
        editLocksMock.getLock.mockResolvedValue(null)

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'release',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(editLocksMock.release).toHaveBeenCalledWith({}, 'pages', 1, 1)
      })
    })

    describe('takeover action', () => {
      it('calls editLocks.takeOver and returns {held: true}', async () => {
        getAdminContext.mockResolvedValue({
          isAdmin: true,
          user: { id: 1, email: 'user@example.com' },
        })

        const request = new Request('http://x/api/admin-edit-lock', {
          method: 'POST',
          body: JSON.stringify({
            collection: 'pages',
            id: 1,
            action: 'takeover',
          }),
        })

        const response = await POST(request)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ held: true })
        expect(editLocksMock.takeOver).toHaveBeenCalledWith(
          {},
          'pages',
          1,
          { userId: 1, label: 'user@example.com' }
        )
      })
    })

    it('sets no-store cache header', async () => {
      getAdminContext.mockResolvedValue({
        isAdmin: true,
        user: { id: 1, email: 'user@example.com' },
      })
      editLocksMock.acquire.mockResolvedValue({ held: true })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'pages',
          id: 1,
          action: 'acquire',
        }),
      })

      const response = await POST(request)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    })

    it('uses email as label when user has no name', async () => {
      getAdminContext.mockResolvedValue({
        isAdmin: true,
        user: { id: 1, email: 'user@example.com' },
      })
      editLocksMock.acquire.mockResolvedValue({ held: true })

      const request = new Request('http://x/api/admin-edit-lock', {
        method: 'POST',
        body: JSON.stringify({
          collection: 'pages',
          id: 1,
          action: 'acquire',
        }),
      })

      await POST(request)
      expect(editLocksMock.acquire).toHaveBeenCalledWith(
        {},
        'pages',
        1,
        { userId: 1, label: 'user@example.com' }
      )
    })
  })
})
