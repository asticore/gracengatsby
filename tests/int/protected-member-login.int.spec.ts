// @vitest-environment node
// Member login for password-protected content and shared password groups.
// Runs against a real local D1 with the full migration set, so the SQL, the gate and the
// unlock route are exercised together. Auth, the engine and the rate limiter are stubbed.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number; roles: string[] },
  tiers: [] as { id: number; name: string; rank: number }[],
  memberships: [] as { user: number; tier: { id: number; rank: number }; status: string; renewsAt: null }[],
  admin: { isAdmin: true, user: { id: 1, roles: ['admin'] }, can: () => true } as Record<string, unknown>,
}))

vi.mock('@/cms/db/connect', () => ({ getDb: async () => state.db }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    auth: async () => ({ user: state.user }),
    find: async ({ collection }: { collection: string }) => {
      if (collection === 'memberships') return { docs: state.memberships }
      if (collection === 'membership-tiers') return { docs: state.tiers }
      return { docs: [] }
    },
    logger: consoleLogger,
  }),
}))
vi.mock('@/admin/auth', () => ({ getAdminContext: async () => state.admin }))
vi.mock('@/features/roles/docAccess', () => ({
  assertDocAccess: async () => ({ ok: true }),
  docAccessDenied: () => new Response('no', { status: 403 }),
}))
vi.mock('@/features/speed/purge', () => ({ purgeCache: async () => ({ ok: true }) }))
vi.mock('@/features/dataViews/cache', () => ({ noteDocumentChanged: (): void => undefined }))
// The limiter itself is covered by the accounts specs; here we only need to see that it is consulted.
vi.mock('@/features/accounts/rateLimit', () => ({
  guardAttempt: vi.fn(async (): Promise<{ allowed: boolean; retryAfterSeconds?: number }> => ({ allowed: true })),
  tooManyAttempts: (): string => 'Too many attempts',
}))

import { excludeProtected, excludeProtectedAccess, getProtectedIds } from '@/features/visibility/excludeProtected'
import { getPasswordGateState, getPasswordGateStateForHeaders } from '@/features/visibility/gate'
import { cookieName, hashPassword } from '@/features/visibility/password'
import { setPasswordHash } from '@/cms/db/contentPasswords'
import { createPasswordGroup, getItemGroupId, setItemGroup, setUnlockRules } from '@/cms/db/passwordGroups'
import { guardAttempt } from '@/features/accounts/rateLimit'
import { POST as unlock } from '@/app/(engage)/api/content-unlock/route'
import {
  DELETE as deleteGroup,
  GET as listGroups,
  POST as createGroup,
  PUT as updateGroup,
} from '@/app/(engage)/api/admin-password-groups/route'
import { GET as getAccess, PUT as putAccess } from '@/app/(engage)/api/admin-visibility-access/route'

const ORIGIN = 'https://example.test'
const PW_GROUP = 'group-secret-1'
const PW_OWN = 'own-secret-1'

// Locked ids in the shared fixture, per collection.
const LOCKED: Record<string, number[]> = { pages: [501, 502], posts: [503], products: [504], events: [505] }

let db: ReturnType<typeof drizzle>
let disposeProxy: (() => Promise<void>) | null = null
let ipCounter = 0

async function unlockRequest(collection: string, id: number, password: string): Promise<Response> {
  const form = new FormData()
  form.set('collection', collection)
  form.set('id', String(id))
  form.set('password', password)
  form.set('redirect', '/')
  const request = new Request(`${ORIGIN}/api/content-unlock`, {
    method: 'POST',
    body: form,
    headers: { 'cf-connecting-ip': `203.0.113.${++ipCounter}` },
  })
  return unlock(request)
}

const jsonRequest = (url: string, method: string, body?: unknown): Request =>
  new Request(`${ORIGIN}${url}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** NextResponse exposes parsed cookies. */
const cookieFor = (response: Response, collection: string, id: number): string | undefined =>
  (response as unknown as { cookies: { get(name: string): { value: string } | undefined } }).cookies.get(cookieName(collection, id))?.value

/** Gate check for one item, presenting only the cookie that belongs to it. */
const gate = (collection: string, id: number, cookieValue?: string, withAccount = true) =>
  getPasswordGateState({
    collection,
    id,
    withAccount,
    cookies: { get: (name: string) => (cookieValue !== undefined && name === cookieName(collection, id) ? { value: cookieValue } : undefined) } as never,
  })

const clearTables = async (): Promise<void> => {
  await db.run(sql`DELETE FROM eg_content_passwords`)
  await db.run(sql`DELETE FROM eg_password_groups`)
}

describe('protected member login (real D1)', () => {
  beforeAll(async () => {
    const proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    disposeProxy = () => proxy.dispose()
    db = drizzle(proxy.env.D1)
    state.db = db
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    process.env.ENGAGE_SECRET = 'test-engage-secret'
  }, 300_000)

  afterAll(async () => {
    await disposeProxy?.()
  })

  beforeEach(async () => {
    vi.mocked(guardAttempt).mockClear()
    vi.mocked(guardAttempt).mockResolvedValue({ allowed: true })
    state.user = null
    state.admin = { isAdmin: true, user: { id: 1, roles: ['admin'] }, can: () => true }
    state.tiers = [
      { id: 7, name: 'Gold', rank: 2 },
      { id: 8, name: 'Silver', rank: 1 },
    ]
    state.memberships = []
    await clearTables()
  })

  describe('signed-in role and tier unlock', () => {
    it('is off by default: a protected item with no unlock rules stays locked for a customer', async () => {
      await setPasswordHash(db as never, 'pages', 101, await hashPassword(PW_OWN))
      state.user = { id: 5, roles: ['customer'] }
      expect(await gate('pages', 101)).toBe('locked')
    })

    it('opens for a signed-in user whose role is allowed, without the password', async () => {
      await setPasswordHash(db as never, 'pages', 102, await hashPassword(PW_OWN))
      expect(await setUnlockRules(db as never, 'pages', 102, { roles: ['customer'], tiers: [] })).toBe(true)
      state.user = { id: 5, roles: ['customer'] }
      expect(await gate('pages', 102)).toBe('open')
    })

    it('stays locked for anonymous visitors and for a signed-in role that is not allowed', async () => {
      await setPasswordHash(db as never, 'pages', 103, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'pages', 103, { roles: ['editor'], tiers: [] })
      expect(await gate('pages', 103)).toBe('locked')
      state.user = { id: 6, roles: ['customer'] }
      expect(await gate('pages', 103)).toBe('locked')
    })

    it('does not apply to callers that do not opt in (cart, RSVP, ICS, embeds)', async () => {
      await setPasswordHash(db as never, 'products', 104, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'products', 104, { roles: ['customer'], tiers: [] })
      state.user = { id: 5, roles: ['customer'] }
      expect(await gate('products', 104, undefined, false)).toBe('locked')
      expect(await getPasswordGateStateForHeaders({ collection: 'products', id: 104, headers: new Headers() })).toBe('locked')
    })

    it('opens for a member on an allowed tier and stays locked for a lower tier', async () => {
      await setPasswordHash(db as never, 'events', 105, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'events', 105, { roles: [], tiers: [7] })
      state.user = { id: 9, roles: ['customer'] }
      state.memberships = [{ user: 9, tier: { id: 8, rank: 1 }, status: 'active', renewsAt: null }]
      expect(await gate('events', 105)).toBe('locked')
      state.memberships = [{ user: 9, tier: { id: 7, rank: 2 }, status: 'active', renewsAt: null }]
      expect(await gate('events', 105)).toBe('open')
    })

    it('fails closed when the auth lookup yields no user', async () => {
      await setPasswordHash(db as never, 'pages', 106, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'pages', 106, { roles: ['customer'], tiers: [] })
      state.user = null
      expect(await gate('pages', 106)).toBe('locked')
    })
  })

  describe('shared group passwords', () => {
    it('one group password unlocks every member item through the unlock route, one cookie each', async () => {
      const groupId = await createPasswordGroup(db as never, 'Members Pack', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 201, groupId)
      await setItemGroup(db as never, 'posts', 202, groupId)
      await setItemGroup(db as never, 'events', 203, groupId)

      expect(await gate('pages', 201)).toBe('locked')
      const response = await unlockRequest('pages', 201, PW_GROUP)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).not.toContain('pw=wrong')
      expect(cookieFor(response, 'pages', 201)).toBeTruthy()
      expect(cookieFor(response, 'posts', 202)).toBeTruthy()
      expect(cookieFor(response, 'events', 203)).toBeTruthy()
      expect(guardAttempt).toHaveBeenCalledWith(expect.anything(), 'password-group', expect.any(String))

      expect(await gate('posts', 202, cookieFor(response, 'posts', 202))).toBe('open')
      expect(await gate('events', 203, cookieFor(response, 'events', 203))).toBe('open')
    })

    it('a wrong group password sets no cookie and says so', async () => {
      const groupId = await createPasswordGroup(db as never, 'Wrong Pack', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 211, groupId)
      const response = await unlockRequest('pages', 211, 'not-the-password')
      expect(response.headers.get('location')).toContain('pw=wrong')
      expect(cookieFor(response, 'pages', 211)).toBeUndefined()
    })

    it('a cookie from one group does not open an item in another group', async () => {
      const groupA = await createPasswordGroup(db as never, 'Group A', await hashPassword(PW_GROUP))
      const groupB = await createPasswordGroup(db as never, 'Group B', await hashPassword('other-group-pw'))
      await setItemGroup(db as never, 'pages', 221, groupA)
      await setItemGroup(db as never, 'pages', 222, groupB)
      const response = await unlockRequest('pages', 221, PW_GROUP)
      expect(await gate('pages', 222, cookieFor(response, 'pages', 221))).toBe('locked')
    })

    it('a group whose row is gone leaves its items locked, even with the right password', async () => {
      await setItemGroup(db as never, 'pages', 231, 99999)
      expect(await gate('pages', 231)).toBe('locked')
      const response = await unlockRequest('pages', 231, PW_GROUP)
      expect(response.headers.get('location')).toContain('pw=wrong')
      expect(cookieFor(response, 'pages', 231)).toBeUndefined()
    })

    it('is rate limited on group attempts: a denied attempt is never checked and sets no cookie', async () => {
      const groupId = await createPasswordGroup(db as never, 'Limited', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 241, groupId)
      vi.mocked(guardAttempt).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 })
      const response = await unlockRequest('pages', 241, PW_GROUP)
      expect(response.headers.get('location')).toContain('pw=wrong')
      expect(cookieFor(response, 'pages', 241)).toBeUndefined()
    })

    it('fails closed when the rate limiter errors', async () => {
      const groupId = await createPasswordGroup(db as never, 'Broken limiter', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 242, groupId)
      vi.mocked(guardAttempt).mockRejectedValueOnce(new Error('limiter down'))
      const response = await unlockRequest('pages', 242, PW_GROUP)
      expect(cookieFor(response, 'pages', 242)).toBeUndefined()
    })

    it('does not consult the group limiter for an item with its own password', async () => {
      await setPasswordHash(db as never, 'pages', 251, await hashPassword(PW_OWN))
      const response = await unlockRequest('pages', 251, PW_OWN)
      expect(cookieFor(response, 'pages', 251)).toBeTruthy()
      expect(guardAttempt).not.toHaveBeenCalled()
    })

    it('setting an own password takes the item out of its group', async () => {
      const groupId = await createPasswordGroup(db as never, 'Leaves', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 261, groupId)
      expect(await getItemGroupId(db as never, 'pages', 261)).toBe(groupId)
      await setPasswordHash(db as never, 'pages', 261, await hashPassword(PW_OWN))
      expect(await getItemGroupId(db as never, 'pages', 261)).toBeNull()
      expect((await unlockRequest('pages', 261, PW_GROUP)).headers.get('location')).toContain('pw=wrong')
    })
  })

  describe('admin group management', () => {
    it('creates a group, lists it, and never returns the hash or the password', async () => {
      const created = await createGroup(jsonRequest('/api/admin-password-groups', 'POST', { name: 'Team', password: PW_GROUP }))
      expect(created.status).toBe(200)
      const text = await (await listGroups()).text()
      expect(text).toContain('Team')
      expect(text).not.toContain('pbkdf2')
      expect(text).not.toContain(PW_GROUP)
    })

    it('rejects a duplicate name, a short password, and a non-admin', async () => {
      await createGroup(jsonRequest('/api/admin-password-groups', 'POST', { name: 'Dup', password: PW_GROUP }))
      expect((await createGroup(jsonRequest('/api/admin-password-groups', 'POST', { name: 'Dup', password: PW_GROUP }))).status).toBe(409)
      expect((await createGroup(jsonRequest('/api/admin-password-groups', 'POST', { name: 'Short', password: 'ab' }))).status).toBe(400)
      state.admin = { isAdmin: false, user: { id: 2, roles: ['editor'] }, can: () => false }
      expect((await createGroup(jsonRequest('/api/admin-password-groups', 'POST', { name: 'Nope', password: PW_GROUP }))).status).toBe(401)
    })

    it('refuses to delete a group that still protects items', async () => {
      const groupId = await createPasswordGroup(db as never, 'Busy', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 301, groupId)
      expect((await deleteGroup(new Request(`${ORIGIN}/api/admin-password-groups?id=${groupId}`, { method: 'DELETE' }))).status).toBe(409)
      expect(await gate('pages', 301)).toBe('locked')
    })

    it('deletes an unused group and renames another', async () => {
      const unusedId = await createPasswordGroup(db as never, 'Unused', await hashPassword(PW_GROUP))
      expect((await deleteGroup(new Request(`${ORIGIN}/api/admin-password-groups?id=${unusedId}`, { method: 'DELETE' }))).status).toBe(200)
      const renameId = await createPasswordGroup(db as never, 'Old name', await hashPassword(PW_GROUP))
      expect((await updateGroup(jsonRequest('/api/admin-password-groups', 'PUT', { id: renameId, name: 'New name' }))).status).toBe(200)
      expect(await (await listGroups()).text()).toContain('New name')
    })
  })

  describe('per-item access settings', () => {
    it('attaches a group and sets roles and tiers, validating every field first', async () => {
      await setPasswordHash(db as never, 'pages', 401, await hashPassword(PW_OWN))
      const groupId = await createPasswordGroup(db as never, 'Access', await hashPassword(PW_GROUP))

      const put = (body: unknown) => putAccess(jsonRequest('/api/admin-visibility-access', 'PUT', { collection: 'pages', id: 401, ...(body as object) }))
      expect((await put({ unlockRoles: ['wizard'] })).status).toBe(400)
      expect((await put({ unlockTiers: [-1] })).status).toBe(400)
      expect((await put({ groupId: 424242 })).status).toBe(400)

      expect((await put({ groupId, unlockRoles: ['customer'], unlockTiers: [7] })).status).toBe(200)
      const read = (await (await getAccess(new Request(`${ORIGIN}/api/admin-visibility-access?collection=pages&id=401`))).json()) as { roles: string[] }
      expect(read).toMatchObject({ protected: true, groupId, unlockRoles: ['customer'], unlockTiers: [7] })
      expect(read.roles).toEqual(['admin', 'editor', 'viewer', 'customer'])
    })

    it('refuses unlock rules on an unprotected item, and leaving a group without an own password', async () => {
      expect((await putAccess(jsonRequest('/api/admin-visibility-access', 'PUT', { collection: 'pages', id: 402, unlockRoles: ['customer'] }))).status).toBe(409)
      const groupId = await createPasswordGroup(db as never, 'Stuck', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 403, groupId)
      expect((await putAccess(jsonRequest('/api/admin-visibility-access', 'PUT', { collection: 'pages', id: 403, groupId: null }))).status).toBe(409)
    })

    it('is admin only', async () => {
      state.admin = { isAdmin: false, user: { id: 2, roles: ['viewer'] }, can: () => false }
      expect((await putAccess(jsonRequest('/api/admin-visibility-access', 'PUT', { collection: 'pages', id: 401, unlockRoles: [] }))).status).toBe(401)
      expect((await getAccess(new Request(`${ORIGIN}/api/admin-visibility-access?collection=pages&id=401`))).status).toBe(401)
    })
  })

  describe('lists, search, sitemap and feeds never show a locked item', () => {
    beforeEach(async () => {
      const groupId = await createPasswordGroup(db as never, 'Lists', await hashPassword(PW_GROUP))
      await setItemGroup(db as never, 'pages', 501, groupId)
      await setPasswordHash(db as never, 'pages', 502, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'pages', 502, { roles: ['customer'], tiers: [7] })
      await setPasswordHash(db as never, 'posts', 503, await hashPassword(PW_OWN))
      await setUnlockRules(db as never, 'posts', 503, { roles: ['customer'], tiers: [] })
      await setItemGroup(db as never, 'products', 504, groupId)
      await setItemGroup(db as never, 'events', 505, groupId)
    })

    it('the protected set holds every locked id, group and role-unlocked alike', async () => {
      expect([...(await getProtectedIds('pages'))].sort((a, b) => a - b)).toEqual(LOCKED.pages)
    })

    it.each(['pages', 'posts', 'products', 'events'] as const)(
      'drops locked %s from lists for anonymous and signed-in customers, and excludes them from the REST read',
      async (collection) => {
        const docs = [...LOCKED[collection], 600].map((id) => ({ id }))
        expect((await excludeProtected(collection, docs)).map((doc) => doc.id)).toEqual([600])

        state.user = { id: 5, roles: ['customer'] }
        const published = { _status: { equals: 'published' } }
        const access = excludeProtectedAccess(collection, () => published)
        const restricted = (await access({ req: { user: state.user } } as never)) as { and: [unknown, { id: { not_in: number[] } }] }
        expect(restricted.and[0]).toEqual(published)
        expect([...restricted.and[1].id.not_in].sort((a, b) => a - b)).toEqual(LOCKED[collection])
      },
    )
  })
})
