// @vitest-environment node
/**
 * Integration tests for cloudflare-worker.ts helpers
 *
 * Tests:
 * - computeCronKey generates correct SHA-256 hex
 * - runScheduled calls worker.fetch with correct headers
 * - runScheduled swallows fetch errors
 * - runScheduled doesn't fetch when ENGAGE_SECRET is missing
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { webcrypto } from 'crypto'

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

// Mock the .open-next/worker.js module which doesn't exist in tests
vi.mock('../../.open-next/worker.js', () => ({
  default: { fetch: mockFetch },
  DOQueueHandler: {},
  DOShardedTagCache: {},
  BucketCachePurge: {},
}))

vi.stubGlobal('crypto', { subtle: webcrypto.subtle })

import { computeCronKey, runScheduled } from '../../cloudflare-worker'

describe('cloudflare-worker helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeCronKey', () => {
    it('computes SHA-256 hex for secret', async () => {
      const key = await computeCronKey('test-secret')
      expect(key).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true)
    })

    it('returns consistent result for same secret', async () => {
      const key1 = await computeCronKey('my-secret')
      const key2 = await computeCronKey('my-secret')
      expect(key1).toBe(key2)
    })

    it('returns different result for different secret', async () => {
      const key1 = await computeCronKey('secret-1')
      const key2 = await computeCronKey('secret-2')
      expect(key1).not.toBe(key2)
    })

    it('matches known SHA-256 of abc:cron', async () => {
      // Actually compute it to verify
      const message = new TextEncoder().encode('abc:cron')
      const hashBuffer = await webcrypto.subtle.digest('SHA-256', message)
      const computed = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await computeCronKey('abc')
      expect(result).toBe(computed)
    })
  })

  describe('runScheduled', () => {
    it('calls worker.fetch with POST to cron.internal and x-cron-key header', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }))

      const mockWorker = { fetch: mockFetch }
      const env = { ENGAGE_SECRET: 'test-secret' }
      const ctx = { waitUntil: vi.fn() }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(mockFetch).toHaveBeenCalledOnce()
      const call = mockFetch.mock.calls[0]
      expect(call[0]).toBeInstanceOf(Request)
      expect(call[0].method).toBe('POST')
      expect(call[0].url).toBe('https://cron.internal/api/cron/publish-scheduled')
      expect(call[0].headers.get('x-cron-key')).toBeTruthy()
      expect(call[0].headers.get('x-cron-key')).toHaveLength(64)
    })

    it('does not call worker.fetch when ENGAGE_SECRET is missing', async () => {
      const mockWorker = { fetch: mockFetch }
      const env: { ENGAGE_SECRET?: string } = { ENGAGE_SECRET: undefined }
      const ctx = { waitUntil: vi.fn() }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not call worker.fetch when ENGAGE_SECRET is empty', async () => {
      const mockWorker = { fetch: mockFetch }
      const env: { ENGAGE_SECRET?: string } = { ENGAGE_SECRET: '' }
      const ctx = { waitUntil: vi.fn() }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('swallows fetch rejection errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const mockWorker = { fetch: mockFetch }
      const env = { ENGAGE_SECRET: 'test-secret' }
      const ctx = { waitUntil: vi.fn() }

      // Should not throw
      await expect(runScheduled(mockWorker as any, env as any, ctx as any)).resolves.toBeUndefined()
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('logs error on fetch rejection', async () => {
      const error = new Error('Fetch failed')
      mockFetch.mockRejectedValue(error)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockWorker = { fetch: mockFetch }
      const env = { ENGAGE_SECRET: 'test-secret' }
      const ctx = { waitUntil: vi.fn() }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(consoleSpy).toHaveBeenCalledWith('scheduled publish error:', error)
      consoleSpy.mockRestore()
    })

    it('logs error when response is not ok', async () => {
      mockFetch.mockResolvedValue(new Response('error', { status: 500 }))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const mockWorker = { fetch: mockFetch }
      const env = { ENGAGE_SECRET: 'test-secret' }
      const ctx = { waitUntil: vi.fn() }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(consoleSpy).toHaveBeenCalledWith('scheduled publish failed:', 500)
      consoleSpy.mockRestore()
    })

    it('passes correct env and ctx to worker.fetch', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }))

      const mockWorker = { fetch: mockFetch }
      const env = { ENGAGE_SECRET: 'secret', OTHER_VAR: 'value' }
      const ctx = { custom: 'context' }

      await runScheduled(mockWorker as any, env as any, ctx as any)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(Request),
        env,
        ctx
      )
    })
  })
})
