import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '@/features/visibility/password'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

const { getPasswordHash, setPasswordHash, clearPassword } = vi.hoisted(() => ({
  getPasswordHash: vi.fn(),
  setPasswordHash: vi.fn(),
  clearPassword: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/cms/db/connect', () => ({ getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash, setPasswordHash, clearPassword }))

import { GET, POST, DELETE } from '@/app/(engage)/api/admin-visibility-password/route'

describe('POST/GET/DELETE /api/admin-visibility-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret-12345'
  })

  describe('GET: check if document has password', () => {
    it('returns 401 when user is not an admin', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=123', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
      expect(getPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 400 when collection is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=invalid&id=123', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection' })
      expect(getPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 400 when id is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=abc', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(400)
      expect(getPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 200 with hasPassword=false when no password is set', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      getDb.mockResolvedValue({})
      getPasswordHash.mockResolvedValue(null)

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=123', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ hasPassword: false })
      expect(getPasswordHash).toHaveBeenCalledWith({}, 'pages', 123)
    })

    it('returns 200 with hasPassword=true when password is set', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      getDb.mockResolvedValue({})
      getPasswordHash.mockResolvedValue('pbkdf2$100000$salt$hash')

      const request = new Request('http://x/api/admin-visibility-password?collection=posts&id=456', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ hasPassword: true })
      expect(getPasswordHash).toHaveBeenCalledWith({}, 'posts', 456)
    })
  })

  describe('POST: set password for document', () => {
    it('returns 401 when user is not an admin', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'pages', id: 123, password: 'mypassword' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
      expect(setPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 400 when collection is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'invalid', id: 123, password: 'mypassword' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection' })
      expect(setPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 400 when id is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'pages', id: 0, password: 'mypassword' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(setPasswordHash).not.toHaveBeenCalled()
    })

    it('returns 400 when password is shorter than minimum length', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'pages', id: 123, password: 'ab' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Password must be at least 4 characters' })
      expect(setPasswordHash).not.toHaveBeenCalled()
    })

    it('stores a hash that is NOT the plain password and starts with pbkdf2$', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      getDb.mockResolvedValue({})

      const request = new Request('http://x/api/admin-visibility-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'pages', id: 123, password: 'mypassword' }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })

      expect(setPasswordHash).toHaveBeenCalled()
      const [_, collection, id, hash] = setPasswordHash.mock.calls[0]
      expect(collection).toBe('pages')
      expect(id).toBe(123)
      expect(hash).not.toContain('mypassword')
      expect(hash).toMatch(/^pbkdf2\$100000\$/)
    })
  })

  describe('DELETE: clear password for document', () => {
    it('returns 401 when user is not an admin', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
      expect(clearPassword).not.toHaveBeenCalled()
    })

    it('returns 400 when collection is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=invalid&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)
      expect(clearPassword).not.toHaveBeenCalled()
    })

    it('returns 400 when id is invalid', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=0', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)
      expect(clearPassword).not.toHaveBeenCalled()
    })

    it('returns 200 and clears password when successful', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
      getDb.mockResolvedValue({})
      clearPassword.mockResolvedValue(undefined)

      const request = new Request('http://x/api/admin-visibility-password?collection=pages&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
      expect(clearPassword).toHaveBeenCalledWith({}, 'pages', 123)
    })
  })
})
