// @vitest-environment node
/**
 * Integration tests for src/app/(engage)/api/admin-schedule/route.ts with mocks
 *
 * Tests:
 * - 401 for non-admin on GET/PUT/DELETE
 * - 400 for invalid collection
 * - 400 for invalid id
 * - 400 for publishAt in the past
 * - 400 for unpublishAt before publishAt
 * - 400 for invalid date string
 * - 200 for valid PUT, calls setSchedule with ISO values
 * - GET returns {publishAt, unpublishAt} or nulls
 * - DELETE calls clearSchedule
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}))

const { drizzle } = vi.hoisted(() => ({
  drizzle: vi.fn(),
}))

const { getSchedule, setSchedule, clearSchedule } = vi.hoisted(() => ({
  getSchedule: vi.fn(),
  setSchedule: vi.fn(),
  clearSchedule: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))
vi.mock('drizzle-orm/d1', () => ({ drizzle }))
vi.mock('@/cms/db/scheduledPublishes', () => ({ getSchedule, setSchedule, clearSchedule }))

import { GET, PUT, DELETE } from '@/app/(engage)/api/admin-schedule/route'

describe('admin-schedule route - mocked', () => {
  const mockDb = { id: 'mock-db' }
  const now = new Date()
  const future1 = new Date(now.getTime() + 1000 * 60 * 60) // 1 hour from now
  const future2 = new Date(now.getTime() + 2000 * 60 * 60) // 2 hours from now
  const past = new Date(now.getTime() - 1000 * 60 * 60) // 1 hour ago

  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(now)

    getCloudflareContext.mockResolvedValue({ env: { D1: {} } })
    drizzle.mockReturnValue(mockDb)
    getSchedule.mockResolvedValue(null)
    setSchedule.mockResolvedValue(undefined)
    clearSchedule.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('GET /api/admin-schedule', () => {
    it('returns 401 for non-admin user', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=123')
      const response = await GET(request)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 for invalid collection', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=invalid&id=123')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection' })
    })

    it('returns 400 for missing id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 400 for non-integer id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=abc')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 400 for zero id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=0')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 400 for negative id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=-5')
      const response = await GET(request)

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 200 with schedule data when found', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      const schedule = {
        publishAt: future1.toISOString(),
        unpublishAt: future2.toISOString(),
      }
      getSchedule.mockResolvedValue(schedule)

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=123')
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(schedule)
    })

    it('returns 200 with nulls when no schedule found', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })
      getSchedule.mockResolvedValue(null)

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=123')
      const response = await GET(request)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ publishAt: null, unpublishAt: null })
    })

    it('calls getSchedule with correct collection and id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=posts&id=456')
      await GET(request)

      expect(getSchedule).toHaveBeenCalledWith(mockDb, 'posts', 456)
    })
  })

  describe('PUT /api/admin-schedule', () => {
    it('returns 401 for non-admin user', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 for invalid collection', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'invalid',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection' })
    })

    it('returns 400 for missing collection', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
    })

    it('returns 400 for invalid id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 'abc',
          publishAt: future1.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 400 for publishAt in the past', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: past.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'publishAt must be in the future' })
    })

    it('returns 400 for unpublishAt in the past', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: past.toISOString(),
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'unpublishAt must be in the future' })
    })

    it('returns 400 when unpublishAt is before publishAt', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future2.toISOString(),
          unpublishAt: future1.toISOString(),
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'unpublishAt must be after publishAt' })
    })

    it('returns 400 for invalid publishAt date string', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: 'not-a-date',
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid publishAt date' })
    })

    it('returns 400 for invalid unpublishAt date string', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: 'bad-date',
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid unpublishAt date' })
    })

    it('returns 200 for valid PUT with both dates', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: future2.toISOString(),
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    })

    it('returns 200 for valid PUT with only publishAt', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'posts',
          id: 456,
          publishAt: future1.toISOString(),
          unpublishAt: null,
        }),
      })

      const response = await PUT(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    })

    it('calls setSchedule with ISO values', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          collection: 'pages',
          id: 123,
          publishAt: future1.toISOString(),
          unpublishAt: future2.toISOString(),
        }),
      })

      await PUT(request)

      expect(setSchedule).toHaveBeenCalledWith(mockDb, 'pages', 123, {
        publishAt: future1.toISOString(),
        unpublishAt: future2.toISOString(),
      })
    })

    it('returns 400 for invalid request body', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule', {
        method: 'PUT',
        body: 'not json',
      })

      const response = await PUT(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid request body' })
    })
  })

  describe('DELETE /api/admin-schedule', () => {
    it('returns 401 for non-admin user', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: false })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorised' })
    })

    it('returns 400 for invalid collection', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=invalid&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid collection' })
    })

    it('returns 400 for invalid id', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=abc', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid id' })
    })

    it('returns 200 for valid DELETE', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=pages&id=123', {
        method: 'DELETE',
      })

      const response = await DELETE(request)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    })

    it('calls clearSchedule with correct arguments', async () => {
      getAdminContext.mockResolvedValue({ isAdmin: true })

      const request = new Request('http://x/api/admin-schedule?collection=posts&id=456', {
        method: 'DELETE',
      })

      await DELETE(request)

      expect(clearSchedule).toHaveBeenCalledWith(mockDb, 'posts', 456)
    })
  })
})
