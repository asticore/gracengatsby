import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))

import { GET } from '@/app/(engage)/api/preview-link/route'

describe('GET /api/preview-link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret-12345'
  })

  it('returns 401 when user is not an admin', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorised' })
  })

  it('returns 400 when collection is invalid', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=invalid&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid collection' })
  })

  it('returns 400 when id is missing', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id' })
  })

  it('returns 400 when id is zero', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=0', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id' })
  })

  it('returns 400 when id is negative', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=-5', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id' })
  })

  it('returns 400 when id is not an integer', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=abc', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id' })
  })

  it('returns 400 when collection is missing', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid collection' })
  })

  it('returns 200 with url and expiresInSeconds for valid pages request', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(200)

    const data = (await response.json()) as { url?: string; expiresInSeconds?: number }
    expect(data.url).toBeTruthy()
    expect(data.url).toContain('/preview/pages/123')
    expect(data.url).toContain('?token=')
    expect(data.expiresInSeconds).toBe(3600)
  })

  it('returns 200 with url and expiresInSeconds for valid posts request', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=posts&id=456', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(200)

    const data = (await response.json()) as { url?: string; expiresInSeconds?: number }
    expect(data.url).toBeTruthy()
    expect(data.url).toContain('/preview/posts/456')
    expect(data.url).toContain('?token=')
    expect(data.expiresInSeconds).toBe(3600)
  })

  it('includes no-store cache control header', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })

    const request = new Request('http://x/api/preview-link?collection=pages&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 500 when getAdminContext throws', async () => {
    getAdminContext.mockRejectedValue(new Error('Auth error'))

    const request = new Request('http://x/api/preview-link?collection=pages&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
  })

  it('returns 500 when ENGAGE_SECRET is missing', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => false })
    process.env.ENGAGE_SECRET = ''

    const request = new Request('http://x/api/preview-link?collection=pages&id=123', {
      method: 'GET',
    })

    const response = await GET(request)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Preview token generation failed' })
  })
})