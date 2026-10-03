// @vitest-environment node
/**
 * Integration tests for src/app/(engage)/api/cron/publish-scheduled/route.ts
 *
 * Mocked fast tests for:
 * - POST/GET require valid x-cron-key header
 * - Invalid/missing key returns 401
 * - ENGAGE_SECRET unset returns 401
 * - Valid key returns 200 with summary JSON and Cache-Control: no-store
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { getEngine } = vi.hoisted(() => ({
  getEngine: vi.fn(),
}))

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}))

const { drizzle } = vi.hoisted(() => ({
  drizzle: vi.fn(),
}))

const { runDueSchedules } = vi.hoisted(() => ({
  runDueSchedules: vi.fn(),
}))

vi.mock('@/engine', () => ({ getEngine }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))
vi.mock('drizzle-orm/d1', () => ({ drizzle }))
vi.mock('@/features/schedule/runDue', () => ({ runDueSchedules }))

import { POST, GET } from '@/app/(engage)/api/cron/publish-scheduled/route'

describe('cron/publish-scheduled route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret'

    // Mock defaults
    getEngine.mockResolvedValue({})
    getCloudflareContext.mockResolvedValue({ env: { D1: {} } })
    drizzle.mockReturnValue({})
    runDueSchedules.mockResolvedValue({ published: 1, unpublished: 0, failed: [] })
  })

  describe('authentication', () => {
    it('POST returns 401 with missing x-cron-key header', async () => {
      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Missing x-cron-key header' })
    })

    it('GET returns 401 with missing x-cron-key header', async () => {
      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'GET',
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Missing x-cron-key header' })
    })

    it('POST returns 401 with wrong x-cron-key', async () => {
      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
        headers: { 'x-cron-key': 'wrongkey' },
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Invalid x-cron-key' })
    })

    it('POST returns 401 with same-length wrong key', async () => {
      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
        headers: { 'x-cron-key': 'a'.repeat(64) }, // SHA-256 is 64 hex chars
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Invalid x-cron-key' })
    })

    it('POST returns 401 when ENGAGE_SECRET is unset', async () => {
      delete process.env.ENGAGE_SECRET

      // Compute valid key for this secret (empty)
      const message = new TextEncoder().encode(':cron')
      const hashBuffer = await crypto.subtle.digest('SHA-256', message)
      const validKey = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
        headers: { 'x-cron-key': validKey },
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'ENGAGE_SECRET not configured' })
    })

    it('GET returns 401 when ENGAGE_SECRET is unset', async () => {
      delete process.env.ENGAGE_SECRET

      // Compute valid key for empty secret
      const message = new TextEncoder().encode(':cron')
      const hashBuffer = await crypto.subtle.digest('SHA-256', message)
      const validKey = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'GET',
        headers: { 'x-cron-key': validKey },
      })

      const response = await GET(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'ENGAGE_SECRET not configured' })
    })
  })

  describe('valid requests', () => {
    it('POST with valid key returns 200 with summary JSON', async () => {
      // Compute valid key
      const message = new TextEncoder().encode('test-secret:cron')
      const hashBuffer = await crypto.subtle.digest('SHA-256', message)
      const validKey = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
        headers: { 'x-cron-key': validKey },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toEqual({ published: 1, unpublished: 0, failed: [] })
      expect(runDueSchedules).toHaveBeenCalledOnce()
    })

    it('GET with valid key returns 200 with summary JSON', async () => {
      // Compute valid key
      const message = new TextEncoder().encode('test-secret:cron')
      const hashBuffer = await crypto.subtle.digest('SHA-256', message)
      const validKey = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'GET',
        headers: { 'x-cron-key': validKey },
      })

      const response = await GET(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toEqual({ published: 1, unpublished: 0, failed: [] })
      expect(runDueSchedules).toHaveBeenCalledOnce()
    })

    it('calls runDueSchedules with engine, db, and ISO time', async () => {
      const mockEngine = { id: 'mock-engine' }
      const mockDb = { id: 'mock-db' }
      getEngine.mockResolvedValue(mockEngine)
      drizzle.mockReturnValue(mockDb)

      // Compute valid key
      const message = new TextEncoder().encode('test-secret:cron')
      const hashBuffer = await crypto.subtle.digest('SHA-256', message)
      const validKey = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const request = new Request('https://example.com/api/cron/publish-scheduled', {
        method: 'POST',
        headers: { 'x-cron-key': validKey },
      })

      await POST(request)

      expect(runDueSchedules).toHaveBeenCalledWith(mockEngine, mockDb, expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
    })
  })
})
