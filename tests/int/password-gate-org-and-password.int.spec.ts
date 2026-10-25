import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  getPasswordHash: vi.fn(),
  getAccessRule: vi.fn(),
  getGroup: vi.fn(),
  settings: vi.fn(),
  orgGateInfo: vi.fn(),
  orgLocked: vi.fn(),
  cookieValue: undefined as string | undefined,
}))

vi.mock('@/cms/db/connect', () => ({ getDb: m.getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash: m.getPasswordHash }))
vi.mock('@/cms/db/passwordGroups', () => ({ getAccessRule: m.getAccessRule, getGroup: m.getGroup }))
vi.mock('@/features/security/settings', () => ({ readSecuritySettingsFromD1: m.settings }))
vi.mock('@/features/organizations/visibility', () => ({
  orgGateLocked: m.orgLocked,
  orgGateInfo: m.orgGateInfo,
  listOrgRestrictedIdsLive: async () => new Set<number>(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'engage-token' && m.cookieValue ? { value: m.cookieValue } : undefined) }) }))

import { getGateOptions, getPasswordGateState } from '@/features/visibility/gate'
import { groupCookieName, signUnlockToken } from '@/features/visibility/password'
import { PasswordGate } from '@/components/PasswordGate'

const HASH = 'pbkdf2$100000$salt$0123456789abcdef0123456789abcdef'
const FP = HASH.slice(-16)
const group: Record<string, unknown> = { id: 3, name: 'Press', hash: HASH, expiresAt: null, maxUses: null, useCount: 0 }
const groupRule: Record<string, unknown> = { collection: 'posts', docId: 5, mode: 'group', groupId: 3, roles: [], tiers: [] }
const noCookies = { get: (): undefined => undefined } as never
const cookiesWith = (name: string, value: string) => ({ get: (n: string) => (n === name ? { value } : undefined) }) as never

// A per-document unlock cookie for posts/5 that matches the document's password.
const docToken = () => signUnlockToken({ collection: 'posts', id: 5, fingerprint: FP }) as Promise<string>
// A group unlock cookie for group 3 with the current group fingerprint.
const groupToken = () => signUnlockToken({ collection: 'password-groups', id: 3, fingerprint: FP }) as Promise<string>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ENGAGE_SECRET = 'test-secret'
  m.cookieValue = undefined
  m.getDb.mockResolvedValue({})
  m.getPasswordHash.mockResolvedValue(null)
  m.getAccessRule.mockResolvedValue(null)
  m.getGroup.mockResolvedValue(group)
  m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
  m.orgGateInfo.mockResolvedValue(null)
  m.orgLocked.mockResolvedValue(false)
})

describe('organisation restriction combined with a password or group', () => {
  it('non-member: the organisation lock wins, so only sign-in is offered and a password cannot open it', async () => {
    m.orgLocked.mockResolvedValue(true)
    m.orgGateInfo.mockResolvedValue({ name: 'Acme' })
    m.getPasswordHash.mockResolvedValue(HASH)

    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: false, org: { name: 'Acme' } })
    // A valid per-document unlock cookie still leaves the document locked while the organisation check fails.
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith('eg_unlock_posts_5', await docToken()) })).toBe('locked')
  })

  it('member with a per-document password: the password form is offered and both conditions are required', async () => {
    m.getPasswordHash.mockResolvedValue(HASH)
    const options = await getGateOptions({ collection: 'posts', id: 5 })
    expect(options).toEqual({ signIn: false, password: true })

    const html = renderToStaticMarkup(await PasswordGate({ collection: 'posts', id: 5, currentPath: '/blog/x', offer: options }))
    expect(html).toContain('type="password"')
    expect(html).not.toContain('Members of')

    // Membership alone is not enough: no unlock cookie means locked.
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith('eg_unlock_posts_5', await docToken()) })).toBe('open')
  })

  it('member with a shared group: the group password form is offered and the group unlock cookie is required', async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: false, password: true })

    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), await groupToken()) })).toBe('open')
  })

  it('non-member with a shared group: the organisation lock still wins over a valid group cookie', async () => {
    m.orgLocked.mockResolvedValue(true)
    m.orgGateInfo.mockResolvedValue({ name: 'Acme' })
    m.getAccessRule.mockResolvedValue(groupRule)

    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: false, org: { name: 'Acme' } })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), await groupToken()) })).toBe('locked')
  })
})
