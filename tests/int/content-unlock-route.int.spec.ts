import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, verifyUnlockToken } from '@/features/visibility/password'

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

const { getPasswordHash } = vi.hoisted(() => ({
  getPasswordHash: vi.fn(),
}))

vi.mock('@/cms/db/connect', () => ({ getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash }))

import { POST } from '@/app/(engage)/api/content-unlock/route'

describe('POST /api/content-unlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret'
  })

  it('returns 400 when collection is invalid', async () => {
    const formData = new FormData()
    formData.append('collection', 'invalid')
    formData.append('id', '123')
    formData.append('password', 'password')
    formData.append('redirect', '/page')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when id is invalid', async () => {
    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '0')
    formData.append('password', 'password')
    formData.append('redirect', '/page')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('redirects to / when document has no password', async () => {
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(null)

    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '123')
    formData.append('password', 'anypassword')
    formData.append('redirect', '/protected-page')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://x/protected-page')
  })

  it('returns 303 with correct password and sets an httpOnly cookie', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '123')
    formData.append('password', password)
    formData.append('redirect', '/protected-page')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://x/protected-page')

    // Check the cookie is set correctly
    const setCookieHeader = response.headers.get('set-cookie')
    expect(setCookieHeader).toBeTruthy()
    expect(setCookieHeader).toContain('eg_unlock_pages_123')
    expect(setCookieHeader).toContain('HttpOnly')
    expect(setCookieHeader).toContain('Secure')
    expect(setCookieHeader?.toLowerCase()).toContain('samesite=lax')

    // Extract and verify the token
    const tokenMatch = setCookieHeader?.match(/eg_unlock_pages_123=([^;]+)/)
    expect(tokenMatch).toBeTruthy()
    const token = tokenMatch?.[1]
    expect(token).toBeTruthy()

    // The token should be verifiable with the correct fingerprint
    const payload = await verifyUnlockToken(token!)
    expect(payload).toBeTruthy()
    expect(payload?.c).toBe('pages')
    expect(payload?.i).toBe(123)
    expect(payload?.h).toBe(hash.slice(-16))
  })

  it('returns 303 with ?pw=wrong on incorrect password and no cookie', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    // Mock setTimeout to not actually delay
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback()
      return {} as any
    })

    try {
      const formData = new FormData()
      formData.append('collection', 'pages')
      formData.append('id', '123')
      formData.append('password', 'wrongpassword')
      formData.append('redirect', '/protected-page')

      const request = new Request('http://x/api/content-unlock', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)

      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toContain('?pw=wrong')
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(setTimeoutSpy).toHaveBeenCalled()
    } finally {
      setTimeoutSpy.mockRestore()
    }
  })

  it('redirects to / when redirect starts with //', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '123')
    formData.append('password', password)
    formData.append('redirect', '//evil.com')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://x/')
  })

  it('redirects to / when redirect starts with backslash', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '123')
    formData.append('password', password)
    formData.append('redirect', '/\\evil')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://x/')
  })

  it('redirects to / when redirect is a full URL', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const formData = new FormData()
    formData.append('collection', 'pages')
    formData.append('id', '123')
    formData.append('password', password)
    formData.append('redirect', 'https://evil.com')

    const request = new Request('http://x/api/content-unlock', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://x/')
  })
})
