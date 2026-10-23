import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext, getDb, getPasswordHash, setPasswordHash, clearPassword, hashPassword, verifyPassword, signUnlockToken, purgeCache, assertDocAccess } =
  vi.hoisted(() => ({
    getAdminContext: vi.fn(),
    getDb: vi.fn(),
    getPasswordHash: vi.fn(),
    setPasswordHash: vi.fn(),
    clearPassword: vi.fn(),
    hashPassword: vi.fn(),
    verifyPassword: vi.fn(),
    signUnlockToken: vi.fn(),
    purgeCache: vi.fn(),
    assertDocAccess: vi.fn(),
  }))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/cms/db/connect', () => ({ getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash, setPasswordHash, clearPassword }))
vi.mock('@/features/visibility/password', () => ({
  hashPassword,
  verifyPassword,
  signUnlockToken,
  cookieName: (c: string, i: number) => `eg_unlock_${c}_${i}`,
}))
vi.mock('@/features/speed/purge', () => ({ purgeCache }))
vi.mock('@/features/dataViews/cache', () => ({ noteDocumentChanged: vi.fn() }))
vi.mock('@/features/roles/docAccess', () => ({ assertDocAccess, docAccessDenied: () => new Response('no', { status: 403 }) }))

import { POST, DELETE, GET } from '@/app/(engage)/api/admin-visibility-password/route'
import { POST as unlock } from '@/app/(engage)/api/content-unlock/route'

function ctx(docs: Record<string, any>, can = vi.fn().mockReturnValue(true)) {
  return { isAdmin: false, can, engine: { findByID: vi.fn(async ({ id }: any) => docs[String(id)] ?? null) } }
}

const post = (body: unknown) =>
  new Request('http://x/api/admin-visibility-password', { method: 'POST', body: JSON.stringify(body) })

describe('admin-visibility-password purge + permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 's'
    getDb.mockResolvedValue({})
    hashPassword.mockResolvedValue('h')
    assertDocAccess.mockResolvedValue({ ok: true })
    purgeCache.mockResolvedValue({})
  })

  it('purges posts at /blog/<slug> with force', async () => {
    getAdminContext.mockResolvedValue(ctx({ '5': { slug: 'hello' } }))
    const res = await POST(post({ collection: 'posts', id: 5, password: 'abcd' }))
    expect(res.status).toBe(200)
    expect(purgeCache).toHaveBeenCalledWith('/blog/hello', { force: true })
  })

  it('purges nested pages at the full parent path', async () => {
    getAdminContext.mockResolvedValue(
      ctx({ '3': { slug: 'c', parent: 2 }, '2': { slug: 'b', parent: { id: 1 } }, '1': { slug: 'a' } }),
    )
    await POST(post({ collection: 'pages', id: 3, password: 'abcd' }))
    expect(purgeCache).toHaveBeenCalledWith('/a/b/c', { force: true })
  })

  it('uses update for GET, POST and DELETE', async () => {
    const can = vi.fn().mockReturnValue(true)
    getAdminContext.mockResolvedValue(ctx({ '1': { slug: 'a' } }, can))
    getPasswordHash.mockResolvedValue(null)
    await GET(new Request('http://x/api/admin-visibility-password?collection=pages&id=1'))
    await DELETE(new Request('http://x/api/admin-visibility-password?collection=pages&id=1', { method: 'DELETE' }))
    await POST(post({ collection: 'pages', id: 1, password: 'abcd' }))
    for (const call of can.mock.calls) expect(call).toEqual(['admin-visibility-password', 'update'])
    expect(can).toHaveBeenCalledTimes(3)
    for (const call of assertDocAccess.mock.calls) expect(call[3]).toBe('update')
  })

  it('refuses to set a password with 503 when ENGAGE_SECRET is missing', async () => {
    delete process.env.ENGAGE_SECRET
    getAdminContext.mockResolvedValue(ctx({}))
    const res = await POST(post({ collection: 'pages', id: 1, password: 'abcd' }))
    expect(res.status).toBe(503)
    expect(setPasswordHash).not.toHaveBeenCalled()
  })
})

describe('content-unlock', () => {
  let ipCounter = 0
  const form = (ip = '1.2.3.4') => {
    const f = new FormData()
    f.append('collection', 'pages')
    f.append('id', '9')
    f.append('password', 'bad')
    f.append('redirect', '/p')
    return new Request('http://x/api/content-unlock', { method: 'POST', body: f, headers: { 'cf-connecting-ip': ip } })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENGAGE_SECRET = 's'
    getDb.mockResolvedValue({})
    getPasswordHash.mockResolvedValue('hash')
    verifyPassword.mockResolvedValue(false)
  })

  it('redirects with pw=unavailable when ENGAGE_SECRET is missing', async () => {
    delete process.env.ENGAGE_SECRET
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await unlock(form())
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('pw=unavailable')
    expect(err).toHaveBeenCalled()
  })

  it('stops verifying after 10 failures from the same ip and doc', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn()
      return 0
    }) as any)
    const ip = `9.9.9.${++ipCounter}`
    for (let i = 0; i < 10; i += 1) await unlock(form(ip))
    expect(verifyPassword).toHaveBeenCalledTimes(10)
    const res = await unlock(form(ip))
    expect(res.headers.get('location')).toContain('pw=wrong')
    expect(verifyPassword).toHaveBeenCalledTimes(10)
    vi.restoreAllMocks()
  })
})
