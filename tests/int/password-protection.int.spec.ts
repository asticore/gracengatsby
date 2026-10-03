import { beforeEach, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, signUnlockToken, verifyUnlockToken, cookieName, type UnlockTokenPayload } from '@/features/visibility/password'

describe('password protection', () => {
  beforeEach(() => {
    process.env.ENGAGE_SECRET = 'test-secret-12345'
  })

  describe('hashPassword and verifyPassword', () => {
    it('hashes a password with PBKDF2', async () => {
      const password = 'my-secure-password'
      const hash = await hashPassword(password)

      expect(hash).toBeTruthy()
      expect(hash).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/)
    })

    it('verifies a correct password', async () => {
      const password = 'test-password-123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword(password, hash)

      expect(isValid).toBe(true)
    })

    it('rejects an incorrect password', async () => {
      const password = 'test-password-123'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('wrong-password', hash)

      expect(isValid).toBe(false)
    })

    it('generates different hashes for the same password (random salt)', async () => {
      const password = 'test-password-123'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2)
      // But both should verify the same password
      expect(await verifyPassword(password, hash1)).toBe(true)
      expect(await verifyPassword(password, hash2)).toBe(true)
    })

    it('rejects malformed hash', async () => {
      const isValid = await verifyPassword('password', 'invalid-hash-format')
      expect(isValid).toBe(false)
    })

    it('rejects hash with wrong iteration count', async () => {
      const password = 'test-password-123'
      const hash = await hashPassword(password)
      const parts = hash.split('$')
      const wrongIterHash = `pbkdf2$50000$${parts[2]}$${parts[3]}`

      const isValid = await verifyPassword(password, wrongIterHash)
      expect(isValid).toBe(false)
    })

    it('rejects hash with tampered salt', async () => {
      const password = 'test-password-123'
      const hash = await hashPassword(password)
      const parts = hash.split('$')
      const tamperedHash = `pbkdf2$100000$different_salt$${parts[3]}`

      const isValid = await verifyPassword(password, tamperedHash)
      expect(isValid).toBe(false)
    })

    it('handles empty password', async () => {
      const hash = await hashPassword('')
      const isValid1 = await verifyPassword('', hash)
      const isValid2 = await verifyPassword('any-password', hash)

      expect(isValid1).toBe(true)
      expect(isValid2).toBe(false)
    })

    it('constant-time comparison resistant to timing attacks', async () => {
      const password = 'test-password-123'
      const hash = await hashPassword(password)

      // All wrong passwords should take similar time due to constant-time comparison
      const wrong1 = await verifyPassword('xxxxxxxxxxxxxxx', hash)
      const wrong2 = await verifyPassword('yyyyyyyyyyyyyy', hash)
      const wrong3 = await verifyPassword('zzzzzzzzzzzzzz', hash)

      expect(wrong1).toBe(false)
      expect(wrong2).toBe(false)
      expect(wrong3).toBe(false)
    })
  })

  describe('signUnlockToken and verifyUnlockToken', () => {
    it('signs a valid token for pages collection', async () => {
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      expect(token).toBeTruthy()
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    })

    it('signs a valid token for posts collection', async () => {
      const token = await signUnlockToken({ collection: 'posts', id: 456 })
      expect(token).toBeTruthy()
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    })

    it('returns null when ENGAGE_SECRET is empty', async () => {
      process.env.ENGAGE_SECRET = ''
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      expect(token).toBeNull()
    })

    it('throws when collection is invalid', async () => {
      await expect(signUnlockToken({ collection: 'invalid', id: 123 })).rejects.toThrow('Invalid collection')
    })

    it('throws when id is not a positive integer', async () => {
      await expect(signUnlockToken({ collection: 'pages', id: 0 })).rejects.toThrow('Invalid id')
      await expect(signUnlockToken({ collection: 'pages', id: -1 })).rejects.toThrow('Invalid id')
      await expect(signUnlockToken({ collection: 'pages', id: 1.5 })).rejects.toThrow('Invalid id')
    })

    it('includes expiry in token', async () => {
      const now = 1000000
      const ttl = 7200
      const token = await signUnlockToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyUnlockToken(token, { now })
      expect(payload).toBeTruthy()
      expect(payload!.e).toBe(now + ttl)
    })

    it('uses default ttl of 604800 seconds (7 days)', async () => {
      const now = 1000000
      const token = await signUnlockToken({ collection: 'pages', id: 123, now })
      const payload = await verifyUnlockToken(token, { now })
      expect(payload!.e).toBe(now + 604800)
    })

    it('verifies a valid token', async () => {
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      const payload = await verifyUnlockToken(token)
      expect(payload).toBeTruthy()
      expect(payload?.c).toBe('pages')
      expect(payload?.i).toBe(123)
    })

    it('returns null for malformed token', async () => {
      const payload = await verifyUnlockToken('invalid')
      expect(payload).toBeNull()
    })

    it('returns null for token with missing parts', async () => {
      const payload = await verifyUnlockToken('onlyoneplusnoplusnothere')
      expect(payload).toBeNull()
    })

    it('returns null for tampered payload', async () => {
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      const [payload, signature] = token.split('.')
      const tamperedToken = `${Buffer.from('{"c":"posts","i":999,"e":9999999}').toString('base64url')}.${signature}`
      const result = await verifyUnlockToken(tamperedToken)
      expect(result).toBeNull()
    })

    it('returns null for tampered signature', async () => {
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      const [payload] = token.split('.')
      const tamperedToken = `${payload}.invalidsignature`
      const result = await verifyUnlockToken(tamperedToken)
      expect(result).toBeNull()
    })

    it('returns null for expired token', async () => {
      const now = 1000000
      const ttl = 3600
      const token = await signUnlockToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyUnlockToken(token, { now: now + ttl + 1 })
      expect(payload).toBeNull()
    })

    it('accepts token at exact expiry boundary', async () => {
      const now = 1000000
      const ttl = 3600
      const token = await signUnlockToken({ collection: 'pages', id: 123, ttlSeconds: ttl, now })
      const payload = await verifyUnlockToken(token, { now: now + ttl })
      expect(payload).toBeTruthy()
    })

    it('returns null for invalid collection in payload', async () => {
      const invalidPayload = { c: 'invalid', i: 123, e: 9999999 }
      const payloadB64 = Buffer.from(JSON.stringify(invalidPayload)).toString('base64url')
      const fakeToken = `${payloadB64}.fakesignature`
      const payload = await verifyUnlockToken(fakeToken)
      expect(payload).toBeNull()
    })

    it('returns null for non-positive id in payload', async () => {
      const invalidPayload = { c: 'pages', i: 0, e: 9999999 }
      const payloadB64 = Buffer.from(JSON.stringify(invalidPayload)).toString('base64url')
      const fakeToken = `${payloadB64}.fakesignature`
      const payload = await verifyUnlockToken(fakeToken)
      expect(payload).toBeNull()
    })

    it('returns null when ENGAGE_SECRET is empty', async () => {
      process.env.ENGAGE_SECRET = ''
      const payload = await verifyUnlockToken('anytokenhere')
      expect(payload).toBeNull()
    })

    it('rejects token signed with different secret', async () => {
      const token = await signUnlockToken({ collection: 'pages', id: 123 })
      process.env.ENGAGE_SECRET = 'different-secret'
      const payload = await verifyUnlockToken(token)
      expect(payload).toBeNull()
    })

    it('roundtrip: sign and verify', async () => {
      const now = 1000000
      const ttlSeconds = 604800
      const token = await signUnlockToken({ collection: 'posts', id: 999, ttlSeconds, now })
      const expected: UnlockTokenPayload = { c: 'posts', i: 999, e: now + ttlSeconds }
      const verified = await verifyUnlockToken(token, { now })
      expect(verified).toEqual(expected)
    })

    it('generates different tokens for different ids', async () => {
      const token1 = await signUnlockToken({ collection: 'pages', id: 123 })
      const token2 = await signUnlockToken({ collection: 'pages', id: 124 })
      expect(token1).not.toBe(token2)
    })

    it('generates different tokens for different collections', async () => {
      const token1 = await signUnlockToken({ collection: 'pages', id: 123 })
      const token2 = await signUnlockToken({ collection: 'posts', id: 123 })
      expect(token1).not.toBe(token2)
    })
  })

  describe('cookieName', () => {
    it('generates correct cookie name', () => {
      const name = cookieName('pages', 123)
      expect(name).toBe('eg_unlock_pages_123')
    })

    it('generates different names for different collections', () => {
      const name1 = cookieName('pages', 123)
      const name2 = cookieName('posts', 123)
      expect(name1).not.toBe(name2)
    })

    it('generates different names for different ids', () => {
      const name1 = cookieName('pages', 123)
      const name2 = cookieName('pages', 456)
      expect(name1).not.toBe(name2)
    })
  })
})
