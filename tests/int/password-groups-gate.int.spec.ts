import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  getPasswordHash: vi.fn(),
  getAccessRule: vi.fn(),
  getGroup: vi.fn(),
  consumeGroupUse: vi.fn(),
  settings: vi.fn(),
  hitShared: vi.fn(),
  recordGroupEvent: vi.fn(),
  getEngine: vi.fn(),
  accountContext: vi.fn(),
  resolveEntitlement: vi.fn(),
}))

vi.mock('@/cms/db/connect', () => ({ getDb: m.getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash: m.getPasswordHash }))
vi.mock('@/cms/db/passwordGroups', () => ({ getAccessRule: m.getAccessRule, getGroup: m.getGroup, consumeGroupUse: m.consumeGroupUse }))
vi.mock('@/features/security/settings', () => ({ readSecuritySettingsFromD1: m.settings }))
vi.mock('@/features/security/rateLimit', () => ({ hitShared: m.hitShared }))
vi.mock('@/features/visibility/groupAudit', () => ({ recordGroupEvent: m.recordGroupEvent }))
vi.mock('@/lib/engine', () => ({ getEngine: m.getEngine }))
vi.mock('@/features/accounts/session', () => ({ accountContext: m.accountContext }))
vi.mock('@/features/members/entitlement', () => ({ resolveEntitlement: m.resolveEntitlement }))

import { getGateOptions, getPasswordGateState, getPasswordGateStateForHeaders } from '@/features/visibility/gate'
import { excludeProtected, excludeProtectedAccess } from '@/features/visibility/excludeProtected'
import { groupIsUsable, viewerQualifies } from '@/features/visibility/access'
import { GROUP_TOKEN_COLLECTION, groupCookieName, hashPassword, signUnlockToken, verifyUnlockToken } from '@/features/visibility/password'
import { POST as unlock } from '@/app/(engage)/api/content-unlock/route'

const HASH = 'pbkdf2$100000$salt$0123456789abcdef0123456789abcdef'
const FP = HASH.slice(-16)
const future = () => new Date(Date.now() + 86_400_000).toISOString()
const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 3, name: 'Press', hash: HASH, expiresAt: null, maxUses: null, useCount: 0, ...over })
const groupRule: Record<string, unknown> = { collection: 'posts', docId: 5, mode: 'group', groupId: 3, roles: [], tiers: [] }
const accountsRule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ collection: 'posts', docId: 5, mode: 'accounts', groupId: null, roles: [], tiers: [], ...over })

const cookiesWith = (name: string, value: string) => ({ get: (n: string) => (n === name ? { value } : undefined) }) as never
const noCookies = { get: (): undefined => undefined } as never

const token = (over: { id?: number; fingerprint?: string; collection?: string } = {}) =>
  signUnlockToken({
    collection: over.collection ?? GROUP_TOKEN_COLLECTION,
    id: over.id ?? 3,
    fingerprint: over.fingerprint ?? FP,
  }) as Promise<string>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ENGAGE_SECRET = 'test-secret'
  m.getDb.mockResolvedValue({})
  m.getPasswordHash.mockResolvedValue(null)
  m.getAccessRule.mockResolvedValue(null)
  m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
  m.hitShared.mockResolvedValue({ limited: false, count: 1, limit: 8, retryAfterSeconds: 1 })
  m.consumeGroupUse.mockResolvedValue(true)
  m.recordGroupEvent.mockResolvedValue(undefined)
})

describe('shared group gate', () => {
  it('is locked without a cookie and open with a valid group cookie, for any document in the group', async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group())
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    const t = await token()
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), t) })).toBe('open')
    // the same cookie opens a different document that references the same group
    m.getAccessRule.mockResolvedValue({ ...groupRule, collection: 'pages', docId: 9 })
    expect(await getPasswordGateState({ collection: 'pages', id: 9, cookies: cookiesWith(groupCookieName(3), t) })).toBe('open')
  })

  it('names its cookie so every cache layer bypasses it', () => {
    expect(groupCookieName(3).startsWith('eg_unlock_')).toBe(true)
  })

  it('rejects a cookie after the group password is rotated (fingerprint changes)', async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    const old = await token()
    m.getGroup.mockResolvedValue(group({ hash: 'pbkdf2$100000$salt$ffffffffffffffff0000000000000000' }))
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), old) })).toBe('locked')
  })

  it('rejects a cookie for another group, a per-document token, and a tampered token', async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group())
    const other = await token({ id: 4 })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), other) })).toBe('locked')
    const perDoc = (await signUnlockToken({ collection: 'posts', id: 3, fingerprint: FP })) as string
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), perDoc) })).toBe('locked')
    const good = await token()
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), `${good}x`) })).toBe('locked')
  })

  it('fails closed: expired, deleted, rule without a group, switched off, lookup error', async () => {
    const t = await token()
    const cookies = cookiesWith(groupCookieName(3), t)
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group({ expiresAt: '2000-01-01T00:00:00.000Z' }))
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies })).toBe('locked')
    m.getGroup.mockResolvedValue(null)
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies })).toBe('locked')
    m.getAccessRule.mockResolvedValue({ ...groupRule, groupId: null })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies })).toBe('locked')
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group())
    m.settings.mockResolvedValue({ passwordGroups: { enabled: false } })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies })).toBe('locked')
    m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
    m.getAccessRule.mockRejectedValue(new Error('db down'))
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies })).toBe('locked')
  })

  it('header-only callers (RSVP, cart, ics) stay locked without the cookie', async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group())
    expect(await getPasswordGateStateForHeaders({ collection: 'posts', id: 5, headers: new Headers() })).toBe('locked')
    expect(await getPasswordGateStateForHeaders({ collection: 'posts', id: 5, headers: undefined })).toBe('locked')
    const t = await token()
    expect(
      await getPasswordGateStateForHeaders({ collection: 'posts', id: 5, headers: new Headers({ cookie: `${groupCookieName(3)}=${encodeURIComponent(t)}` }) }),
    ).toBe('open')
  })

  it('a group token is never accepted by the signing helper for an unknown collection', async () => {
    await expect(signUnlockToken({ collection: 'users', id: 1 })).rejects.toThrow()
    const t = await token()
    expect((await verifyUnlockToken(t))?.c).toBe(GROUP_TOKEN_COLLECTION)
  })

  it('groupIsUsable treats junk expiry as expired', () => {
    expect(groupIsUsable({ expiresAt: null })).toBe(true)
    expect(groupIsUsable({ expiresAt: future() })).toBe(true)
    expect(groupIsUsable({ expiresAt: 'soon' })).toBe(false)
    expect(groupIsUsable(null)).toBe(false)
  })
})

describe('visible to signed-in accounts', () => {
  const signedIn = (user: unknown) => m.accountContext.mockResolvedValue({ user, engine: {} })

  it('opens for any signed-in account when no roles or tiers are set, never for anonymous', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule())
    signedIn({ id: 7, roles: ['customer'] })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('open')
    signedIn(null)
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    m.accountContext.mockRejectedValue(new Error('no request scope'))
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
  })

  it('matches on role, or on the membership tier slug, and otherwise stays locked', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule({ roles: ['editor'], tiers: ['gold'] }))
    signedIn({ id: 7, roles: ['editor'] })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('open')

    signedIn({ id: 8, roles: ['customer'] })
    m.resolveEntitlement.mockResolvedValue({ rank: 2, tier: { slug: 'gold' } })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('open')
    m.resolveEntitlement.mockResolvedValue({ rank: 1, tier: { slug: 'silver' } })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    m.resolveEntitlement.mockResolvedValue({ rank: 0, tier: null })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    m.resolveEntitlement.mockRejectedValue(new Error('boom'))
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
  })

  it('an unqualified visitor can still get in with the attached group password cookie', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule({ roles: ['editor'], groupId: 3 }))
    m.getGroup.mockResolvedValue(group())
    signedIn({ id: 8, roles: ['customer'] })
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: noCookies })).toBe('locked')
    expect(await getPasswordGateState({ collection: 'posts', id: 5, cookies: cookiesWith(groupCookieName(3), await token()) })).toBe('open')
  })

  it('header-only callers resolve the visitor from the request session', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule())
    m.getEngine.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: { id: 7, roles: [] } }) })
    expect(await getPasswordGateStateForHeaders({ collection: 'posts', id: 5, headers: new Headers({ cookie: 'engage-token=x' }) })).toBe('open')
    m.getEngine.mockRejectedValue(new Error('down'))
    expect(await getPasswordGateStateForHeaders({ collection: 'posts', id: 5, headers: new Headers() })).toBe('locked')
  })

  it('viewerQualifies fails closed for admin-less, id-less and non-accounts input', async () => {
    expect(await viewerQualifies({ mode: 'group', roles: [], tiers: [] }, { user: { id: 1 } })).toBe(false)
    expect(await viewerQualifies({ mode: 'accounts', roles: [], tiers: [] }, { user: { roles: [] } })).toBe(false)
    expect(await viewerQualifies({ mode: 'accounts', roles: ['x'], tiers: [] }, null)).toBe(false)
    expect(await viewerQualifies({ mode: 'accounts', roles: ['x'], tiers: [] }, { user: { id: 1, roles: ['admin'] } })).toBe(true)
  })

  it('gate options: sign-in for accounts rules, password only when a usable group is attached', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule())
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: false })
    m.getAccessRule.mockResolvedValue(accountsRule({ groupId: 3 }))
    m.getGroup.mockResolvedValue(group())
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: true })
    m.getGroup.mockResolvedValue(group({ expiresAt: '2000-01-01T00:00:00.000Z' }))
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: false })
    m.getPasswordHash.mockResolvedValue(HASH)
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: false, password: true })
    m.getDb.mockRejectedValue(new Error('x'))
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: false, password: true })
  })
})

describe('leaks: lists, search, sitemap and REST', () => {
  const rows = (list: Record<string, unknown>[]) => ({ all: vi.fn().mockResolvedValue(list) })

  it('hides group and accounts documents from visitors who do not qualify, and fails closed', async () => {
    m.getDb.mockResolvedValue(
      rows([
        { doc_id: 1, mode: 'group', roles: '[]', tiers: '[]' },
        { doc_id: 2, mode: 'accounts', roles: '["editor"]', tiers: '[]' },
        { doc_id: 3, mode: null, roles: null, tiers: null },
      ]),
    )
    const docs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    expect(await excludeProtected('posts', docs)).toEqual([{ id: 4 }])
    expect(await excludeProtected('posts', docs, { user: null })).toEqual([{ id: 4 }])
    expect(await excludeProtected('posts', docs, { user: { id: 9, roles: ['customer'] } })).toEqual([{ id: 4 }])
    // a qualifying account sees its accounts document, never the group or password documents
    expect(await excludeProtected('posts', docs, { user: { id: 9, roles: ['editor'] } })).toEqual([{ id: 2 }, { id: 4 }])
    m.getDb.mockRejectedValue(new Error('db down'))
    expect(await excludeProtected('posts', docs, { user: { id: 9, roles: ['editor'] } })).toEqual([])
  })

  it('REST read access: not_in for non-qualifying users, relaxed for qualifying ones, denied on failure', async () => {
    const published = { _status: { equals: 'published' } }
    m.getDb.mockResolvedValue(rows([{ doc_id: 2, mode: 'accounts', roles: '["editor"]', tiers: '[]' }, { doc_id: 1, mode: 'group', roles: '[]', tiers: '[]' }]))
    const access = excludeProtectedAccess('posts', () => published)
    expect(await access({ req: { user: null } } as never)).toEqual({ and: [published, { id: { not_in: [2, 1] } }] })
    expect(await access({ req: { user: { id: 3, roles: ['editor'] } } } as never)).toEqual({ and: [published, { id: { not_in: [1] } }] })
    m.getDb.mockRejectedValue(new Error('db down'))
    expect(await access({ req: { user: { id: 3, roles: ['editor'] } } } as never)).toBe(false)
  })
})

describe('POST /api/content-unlock with a group', () => {
  const post = async (password: string, ip = '1.2.3.4') => {
    const form = new FormData()
    form.set('collection', 'posts')
    form.set('id', '5')
    form.set('password', password)
    form.set('redirect', '/blog/secret')
    return unlock(new Request('http://x/api/content-unlock', { method: 'POST', body: form, headers: { 'cf-connecting-ip': ip } }))
  }

  beforeEach(async () => {
    m.getAccessRule.mockResolvedValue(groupRule)
    m.getGroup.mockResolvedValue(group({ hash: await hashPassword('correct horse') }))
  })

  it('sets one signed group cookie on the right password, counts the use, and audits', async () => {
    const res = await post('correct horse')
    expect(res.status).toBe(303)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${groupCookieName(3)}=`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(m.consumeGroupUse).toHaveBeenCalledOnce()
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.unlock', groupId: 3 }))
    const value = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    expect((await verifyUnlockToken(value))?.i).toBe(3)
  })

  it('sends a wrong password back with no cookie and an audit line', async () => {
    const res = await post('nope nope')
    expect(res.headers.get('location')).toContain('pw=wrong')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(m.consumeGroupUse).not.toHaveBeenCalled()
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.unlock-failed' }))
  })

  it('refuses when rate limited, expired, over its use cap, switched off, or missing', async () => {
    m.hitShared.mockResolvedValueOnce({ limited: true, count: 9, limit: 8, retryAfterSeconds: 30 })
    let res = await post('correct horse')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(m.recordGroupEvent).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'password-group.refused' }))

    m.getGroup.mockResolvedValue(group({ hash: await hashPassword('correct horse'), expiresAt: '2000-01-01T00:00:00.000Z' }))
    res = await post('correct horse')
    expect(res.headers.get('set-cookie')).toBeNull()

    m.getGroup.mockResolvedValue(group({ hash: await hashPassword('correct horse') }))
    m.consumeGroupUse.mockResolvedValueOnce(false)
    res = await post('correct horse')
    expect(res.headers.get('set-cookie')).toBeNull()

    m.settings.mockResolvedValue({ passwordGroups: { enabled: false } })
    res = await post('correct horse')
    expect(res.headers.get('location')).toContain('pw=unavailable')
    expect(res.headers.get('set-cookie')).toBeNull()

    m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
    m.getGroup.mockResolvedValue(null)
    res = await post('correct horse')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('keys the shared limiter by address and group', async () => {
    await post('correct horse', '9.9.9.9')
    expect(m.hitShared).toHaveBeenCalledWith('group-unlock|9.9.9.9|3', expect.any(Number))
  })

  it('an accounts rule with no group sets no cookie and unlocks nothing', async () => {
    m.getAccessRule.mockResolvedValue(accountsRule())
    const res = await post('anything')
    expect(res.status).toBe(303)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
