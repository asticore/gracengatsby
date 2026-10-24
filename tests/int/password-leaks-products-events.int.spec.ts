import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDb, getPasswordHash, getAdminContext, purgeCache, hashPassword, assertDocAccess } = vi.hoisted(() => ({
  getDb: vi.fn(),
  getPasswordHash: vi.fn(),
  getAdminContext: vi.fn(),
  purgeCache: vi.fn(),
  hashPassword: vi.fn(),
  assertDocAccess: vi.fn(),
}))
vi.mock('@/cms/db/connect', () => ({ getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash, setPasswordHash: vi.fn(), clearPassword: vi.fn() }))
vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/speed/purge', () => ({ purgeCache }))
vi.mock('@/features/dataViews/cache', () => ({ noteDocumentChanged: vi.fn() }))
vi.mock('@/features/roles/docAccess', () => ({ assertDocAccess, docAccessDenied: () => new Response('no', { status: 403 }) }))

import { excludeProtected, excludeProtectedAccess } from '@/features/visibility/excludeProtected'
import { getPasswordGateStateForHeaders } from '@/features/visibility/gate'
import { signUnlockToken } from '@/features/visibility/password'
import { checkEventCapacity } from '@/hooks/checkEventCapacity'
import { POST as adminPost } from '@/app/(engage)/api/admin-visibility-password/route'
import { POST as unlock } from '@/app/(engage)/api/content-unlock/route'

const dbWith = (rows: { doc_id: number }[]) => ({ all: vi.fn().mockResolvedValue(rows) })

describe('products and events are protectable collections', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['products', 'events'] as const)('excludeProtected drops locked %s and fails closed', async (collection) => {
    getDb.mockResolvedValue(dbWith([{ doc_id: 2 }]))
    expect(await excludeProtected(collection, [{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }])
    getDb.mockRejectedValue(new Error('db down'))
    expect(await excludeProtected(collection, [{ id: 1 }])).toEqual([])
  })

  it.each(['products', 'events'] as const)('excludeProtectedAccess adds not_in for %s and denies on failure', async (collection) => {
    const published = { _status: { equals: 'published' } }
    getDb.mockResolvedValue(dbWith([{ doc_id: 9 }]))
    expect(await excludeProtectedAccess(collection, () => published)({ req: { user: null } } as never)).toEqual({
      and: [published, { id: { not_in: [9] } }],
    })
    getDb.mockRejectedValue(new Error('db down'))
    expect(await excludeProtectedAccess(collection, () => published)({ req: { user: null } } as never)).toBe(false)
  })
})

describe('getPasswordGateStateForHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret'
    getDb.mockResolvedValue({})
  })
  const HASH = 'pbkdf2$100000$salt$0123456789abcdef0123456789abcdef'

  it('is open when nothing is protected', async () => {
    getPasswordHash.mockResolvedValue(null)
    expect(await getPasswordGateStateForHeaders({ collection: 'products', id: 4, headers: new Headers() })).toBe('open')
  })

  it('is locked without headers or cookie, and when the lookup fails', async () => {
    getPasswordHash.mockResolvedValue(HASH)
    expect(await getPasswordGateStateForHeaders({ collection: 'events', id: 4, headers: undefined })).toBe('locked')
    expect(await getPasswordGateStateForHeaders({ collection: 'events', id: 4, headers: new Headers({ cookie: 'a=b' }) })).toBe('locked')
    getPasswordHash.mockRejectedValue(new Error('boom'))
    expect(await getPasswordGateStateForHeaders({ collection: 'events', id: 4, headers: new Headers() })).toBe('locked')
  })

  it('opens with a valid cookie for that exact document only', async () => {
    getPasswordHash.mockResolvedValue(HASH)
    const token = await signUnlockToken({ collection: 'products', id: 4, fingerprint: HASH.slice(-16) })
    const headers = new Headers({ cookie: `x=1; eg_unlock_products_4=${token}` })
    expect(await getPasswordGateStateForHeaders({ collection: 'products', id: 4, headers })).toBe('open')
    expect(await getPasswordGateStateForHeaders({ collection: 'products', id: 5, headers })).toBe('locked')
    expect(await getPasswordGateStateForHeaders({ collection: 'events', id: 4, headers })).toBe('locked')
  })
})

describe('RSVP to a protected event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 'test-secret'
    getDb.mockResolvedValue({})
  })
  const engine = { findByID: vi.fn().mockResolvedValue({ capacity: 0 }), find: vi.fn() }
  const run = (req: Record<string, unknown>) =>
    (checkEventCapacity as unknown as (a: unknown) => Promise<unknown>)({ data: { event: '7' }, operation: 'create', req: { engine, ...req } })

  it('refuses a visitor who has not unlocked it', async () => {
    getPasswordHash.mockResolvedValue('pbkdf2$100000$s$0123456789abcdef0123456789abcdef')
    await expect(run({ headers: new Headers() })).rejects.toThrow(/password protected/)
    await expect(run({})).rejects.toThrow(/password protected/)
  })

  it('allows an open event and an admin', async () => {
    getPasswordHash.mockResolvedValue(null)
    await expect(run({ headers: new Headers() })).resolves.toBeTruthy()
    getPasswordHash.mockResolvedValue('pbkdf2$100000$s$0123456789abcdef0123456789abcdef')
    await expect(run({ user: { roles: ['admin'] } })).resolves.toBeTruthy()
  })
})

describe('set/clear and unlock routes accept products and events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 's'
    getDb.mockResolvedValue({})
    hashPassword.mockResolvedValue('h')
    assertDocAccess.mockResolvedValue({ ok: true })
    purgeCache.mockResolvedValue({})
  })
  const ctx = (docs: Record<string, unknown>) => ({
    isAdmin: false,
    can: vi.fn().mockReturnValue(true),
    engine: { findByID: vi.fn(async ({ id }: { id: number }) => docs[String(id)] ?? null) },
  })
  const post = (body: unknown) => new Request('http://x/api/admin-visibility-password', { method: 'POST', body: JSON.stringify(body) })

  it('purges the product URL and the shop archive', async () => {
    getAdminContext.mockResolvedValue(ctx({ '5': { slug: 'scarf' } }))
    expect((await adminPost(post({ collection: 'products', id: 5, password: 'abcd' }))).status).toBe(200)
    expect(purgeCache).toHaveBeenCalledWith(['/shop/scarf', '/shop'], { force: true })
  })

  it('purges the event URL and the events archive', async () => {
    getAdminContext.mockResolvedValue(ctx({ '6': { slug: 'gala' } }))
    expect((await adminPost(post({ collection: 'events', id: 6, password: 'abcd' }))).status).toBe(200)
    expect(purgeCache).toHaveBeenCalledWith(['/events/gala', '/events'], { force: true })
  })

  it('still rejects other collections', async () => {
    getAdminContext.mockResolvedValue(ctx({}))
    expect((await adminPost(post({ collection: 'courses', id: 1, password: 'abcd' }))).status).toBe(400)
  })

  it('content-unlock validates products and events instead of 400', async () => {
    getPasswordHash.mockResolvedValue(null)
    for (const collection of ['products', 'events']) {
      const form = new FormData()
      form.set('collection', collection)
      form.set('id', '3')
      form.set('password', 'x')
      form.set('redirect', '/shop/a')
      const res = await unlock(new Request('http://x/api/content-unlock', { method: 'POST', body: form }))
      expect(res.status).toBe(303)
    }
  })
})
