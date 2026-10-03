import { beforeEach, describe, expect, it } from 'vitest'
import { signPreviewToken, verifyPreviewToken, type PreviewTokenPayload } from '@/utilities/previewToken'

describe('previewToken', () => {
  beforeEach(() => {
    process.env.ENGAGE_SECRET = 'test-secret-12345'
  })

  describe('signPreviewToken', () => {
    it('signs a valid token for pages collection', async () => {
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      expect(token).toBeTruthy()
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) // Should be two base64url parts
    })

    it('signs a valid token for posts collection', async () => {
      const token = await signPreviewToken({ collection: 'posts', id: 456 })
      expect(token).toBeTruthy()
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    })

    it('returns null when ENGAGE_SECRET is empty', async () => {
      process.env.ENGAGE_SECRET = ''
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      expect(token).toBeNull()
    })

    it('throws when collection is invalid', async () => {
      await expect(signPreviewToken({ collection: 'invalid', id: 123 })).rejects.toThrow('Invalid collection')
    })

    it('throws when id is not a positive integer', async () => {
      await expect(signPreviewToken({ collection: 'pages', id: 0 })).rejects.toThrow('Invalid id')
      await expect(signPreviewToken({ collection: 'pages', id: -1 })).rejects.toThrow('Invalid id')
      await expect(signPreviewToken({ collection: 'pages', id: 1.5 })).rejects.toThrow('Invalid id')
    })

    it('includes expiry in token', async () => {
      const now = 1000000
      const ttl = 3600
      const token = await signPreviewToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyPreviewToken(token, { now })
      expect(payload).toBeTruthy()
      expect(payload!.e).toBe(now + ttl)
    })

    it('uses default ttl of 3600 seconds', async () => {
      const now = 1000000
      const token = await signPreviewToken({ collection: 'pages', id: 123, now })
      const payload = await verifyPreviewToken(token, { now })
      expect(payload!.e).toBe(now + 3600)
    })

    it('generates different tokens for different ids', async () => {
      const token1 = await signPreviewToken({ collection: 'pages', id: 123 })
      const token2 = await signPreviewToken({ collection: 'pages', id: 124 })
      expect(token1).not.toBe(token2)
    })

    it('generates different tokens for different collections', async () => {
      const token1 = await signPreviewToken({ collection: 'pages', id: 123 })
      const token2 = await signPreviewToken({ collection: 'posts', id: 123 })
      expect(token1).not.toBe(token2)
    })
  })

  describe('verifyPreviewToken', () => {
    it('verifies a valid token', async () => {
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      const payload = await verifyPreviewToken(token)
      expect(payload).toBeTruthy()
      expect(payload?.c).toBe('pages')
      expect(payload?.i).toBe(123)
    })

    it('returns null for malformed token', async () => {
      const payload = await verifyPreviewToken('invalid')
      expect(payload).toBeNull()
    })

    it('returns null for token with missing parts', async () => {
      const payload = await verifyPreviewToken('onlyoneplusnoplusnothere')
      expect(payload).toBeNull()
    })

    it('returns null for tampered payload', async () => {
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      const [payload, signature] = token.split('.')
      const tamperedToken = `${Buffer.from('{"c":"posts","i":999,"e":9999999}').toString('base64url')}.${signature}`
      const result = await verifyPreviewToken(tamperedToken)
      expect(result).toBeNull()
    })

    it('returns null for tampered signature', async () => {
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      const [payload] = token.split('.')
      const tamperedToken = `${payload}.invalidsignature`
      const result = await verifyPreviewToken(tamperedToken)
      expect(result).toBeNull()
    })

    it('returns null for expired token', async () => {
      const now = 1000000
      const ttl = 3600
      const token = await signPreviewToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyPreviewToken(token, { now: now + ttl + 1 })
      expect(payload).toBeNull()
    })

    it('accepts token at exact expiry boundary', async () => {
      const now = 1000000
      const ttl = 3600
      const token = await signPreviewToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyPreviewToken(token, { now: now + ttl })
      // Token is expired at exact boundary (now > payload.e is false, so valid)
      expect(payload).toBeTruthy()
    })

    it('returns null for invalid collection in payload', async () => {
      // Manually create a token with invalid collection
      const invalidPayload = { c: 'invalid', i: 123, e: 9999999 }
      const payloadB64 = Buffer.from(JSON.stringify(invalidPayload)).toString('base64url')
      const fakeToken = `${payloadB64}.fakesignature`
      const payload = await verifyPreviewToken(fakeToken)
      expect(payload).toBeNull()
    })

    it('returns null for non-positive id in payload', async () => {
      const invalidPayload = { c: 'pages', i: 0, e: 9999999 }
      const payloadB64 = Buffer.from(JSON.stringify(invalidPayload)).toString('base64url')
      const fakeToken = `${payloadB64}.fakesignature`
      const payload = await verifyPreviewToken(fakeToken)
      expect(payload).toBeNull()
    })

    it('returns null when ENGAGE_SECRET is empty', async () => {
      process.env.ENGAGE_SECRET = ''
      const payload = await verifyPreviewToken('anytokenhere')
      expect(payload).toBeNull()
    })

    it('rejects token signed with different secret', async () => {
      const token = await signPreviewToken({ collection: 'pages', id: 123 })
      process.env.ENGAGE_SECRET = 'different-secret'
      const payload = await verifyPreviewToken(token)
      expect(payload).toBeNull()
    })

    it('roundtrip: sign and verify', async () => {
      const now = 1000000
      const ttlSeconds = 3600
      const token = await signPreviewToken({ collection: 'posts', id: 999, ttlSeconds, now })
      const expected: PreviewTokenPayload = { c: 'posts', i: 999, e: now + ttlSeconds }
      const verified = await verifyPreviewToken(token, { now })
      expect(verified).toEqual(expected)
    })
  })
})
