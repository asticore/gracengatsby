import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, signUnlockToken, verifyUnlockToken } from '@/features/visibility/password'

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

const { getPasswordHash } = vi.hoisted(() => ({
  getPasswordHash: vi.fn(),
}))

vi.mock('@/cms/db/connect', () => ({ getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash }))

import { getPasswordGateState } from '@/features/visibility/gate'

describe('getPasswordGateState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret'
  })

  it('returns open when no password is set', async () => {
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(null)

    const cookies = { get: (name: string): undefined => undefined }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('open')
  })

  it('returns locked when password is set but no cookie present', async () => {
    const hash = await hashPassword('hunter22')
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const cookies = { get: (name: string): undefined => undefined }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('locked')
  })

  it('returns open when valid unlock token is present', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    const token = await signUnlockToken({
      collection: 'pages',
      id: 123,
      fingerprint: hash.slice(-16),
    })

    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const cookies = {
      get: (name: string) => {
        if (name === 'eg_unlock_pages_123') {
          return { value: token! }
        }
        return undefined
      },
    }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('open')
  })

  it('returns locked when token is for a different id', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    const token = await signUnlockToken({
      collection: 'pages',
      id: 999, // Different id
      fingerprint: hash.slice(-16),
    })

    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const cookies = {
      get: (name: string) => {
        if (name === 'eg_unlock_pages_123') {
          return { value: token! }
        }
        return undefined
      },
    }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('locked')
  })

  it('returns locked when token has a different fingerprint (password changed)', async () => {
    const password1 = 'hunter22'
    const hash1 = await hashPassword(password1)
    const oldToken = await signUnlockToken({
      collection: 'pages',
      id: 123,
      fingerprint: hash1.slice(-16),
    })

    const password2 = 'newpassword'
    const hash2 = await hashPassword(password2)

    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash2)

    const cookies = {
      get: (name: string) => {
        if (name === 'eg_unlock_pages_123') {
          return { value: oldToken! }
        }
        return undefined
      },
    }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('locked')
  })

  it('returns locked when token is garbage/invalid', async () => {
    const hash = await hashPassword('hunter22')
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const cookies = {
      get: (name: string) => {
        if (name === 'eg_unlock_pages_123') {
          return { value: 'garbage-token-data' }
        }
        return undefined
      },
    }

    const state = await getPasswordGateState({
      collection: 'pages',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('locked')
  })

  it('returns open for non-pages/posts collections regardless of password', async () => {
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(null)

    const cookies = { get: (name: string): undefined => undefined }

    const state = await getPasswordGateState({
      collection: 'products',
      id: 123,
      cookies: cookies as any,
    })

    expect(state).toBe('open')
    expect(getPasswordHash).not.toHaveBeenCalled()
  })

  it('returns open for posts collection with valid token', async () => {
    const password = 'hunter22'
    const hash = await hashPassword(password)
    const token = await signUnlockToken({
      collection: 'posts',
      id: 456,
      fingerprint: hash.slice(-16),
    })

    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue(hash)

    const cookies = {
      get: (name: string) => {
        if (name === 'eg_unlock_posts_456') {
          return { value: token! }
        }
        return undefined
      },
    }

    const state = await getPasswordGateState({
      collection: 'posts',
      id: 456,
      cookies: cookies as any,
    })

    expect(state).toBe('open')
  })
})
