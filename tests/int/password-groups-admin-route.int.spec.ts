import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  getAdminContext: vi.fn(),
  purgeCache: vi.fn(),
  recordGroupEvent: vi.fn(),
  settings: vi.fn(),
  assertDocAccess: vi.fn(),
  g: {
    createGroup: vi.fn(),
    deleteGroup: vi.fn(),
    getGroup: vi.fn(),
    listGroupMembers: vi.fn(),
    listGroups: vi.fn(),
    rotateGroupHash: vi.fn(),
    updateGroupSettings: vi.fn(),
    setAccessRule: vi.fn(),
    clearAccessRule: vi.fn(),
    getAccessRule: vi.fn(),
  },
  clearPassword: vi.fn(),
}))

vi.mock('@/cms/db/connect', () => ({ getDb: m.getDb }))
vi.mock('@/admin/auth', () => ({ getAdminContext: m.getAdminContext }))
vi.mock('@/features/speed/purge', () => ({ purgeCache: m.purgeCache }))
vi.mock('@/features/dataViews/cache', () => ({ noteDocumentChanged: vi.fn() }))
vi.mock('@/features/visibility/groupAudit', () => ({ recordGroupEvent: m.recordGroupEvent }))
vi.mock('@/features/security/settings', () => ({ readSecuritySettingsFromD1: m.settings }))
vi.mock('@/cms/db/passwordGroups', () => m.g)
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash: vi.fn().mockResolvedValue(null), clearPassword: m.clearPassword }))
vi.mock('@/features/roles/docAccess', () => ({ assertDocAccess: m.assertDocAccess, docAccessDenied: () => new Response('no', { status: 403 }) }))

import { DELETE, GET, PATCH, POST } from '@/app/(engage)/api/admin-password-groups/route'
import { DELETE as accessDelete, POST as accessPost } from '@/app/(engage)/api/admin-visibility-access/route'

const slugs: Record<string, { slug: string }> = { '1': { slug: 'secret-post' }, '2': { slug: 'vault' } }
const ctx = (over: Record<string, unknown> = {}) => ({
  isAdmin: true,
  can: vi.fn(() => true),
  user: { id: 1, email: 'a@example.com' },
  engine: { findByID: vi.fn(async ({ id }: { id: number }) => slugs[String(id)] ?? { slug: `doc-${id}` }) },
  ...over,
})
const json = (method: string, body: unknown, url = 'http://x/api/admin-password-groups') =>
  new Request(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ENGAGE_SECRET = 'test-secret'
  m.getDb.mockResolvedValue({})
  m.getAdminContext.mockResolvedValue(ctx())
  m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
  m.purgeCache.mockResolvedValue({ ran: true })
  m.recordGroupEvent.mockResolvedValue(undefined)
  m.assertDocAccess.mockResolvedValue({ ok: true })
  m.g.listGroups.mockResolvedValue([])
  m.g.createGroup.mockResolvedValue(7)
  m.g.getGroup.mockResolvedValue({ id: 7, name: 'Press', hash: 'h', expiresAt: null, maxUses: null, useCount: 0 })
  m.g.listGroupMembers.mockResolvedValue([
    { collection: 'posts', docId: 1 },
    { collection: 'pages', docId: 2 },
  ])
})

describe('admin-password-groups', () => {
  it('only admins can write; others get 401 and nothing is touched', async () => {
    m.getAdminContext.mockResolvedValue(ctx({ isAdmin: false }))
    expect((await POST(json('POST', { name: 'A', password: 'secret1' }))).status).toBe(401)
    expect((await PATCH(json('PATCH', { id: 7, password: 'secret1' }))).status).toBe(401)
    expect((await DELETE(new Request('http://x/api/admin-password-groups?id=7', { method: 'DELETE' }))).status).toBe(401)
    expect(m.g.createGroup).not.toHaveBeenCalled()
    expect(m.g.rotateGroupHash).not.toHaveBeenCalled()
    expect(m.g.deleteGroup).not.toHaveBeenCalled()
  })

  it('GET lists groups with their content and never a hash; unauthorised callers get 401', async () => {
    m.g.listGroups.mockResolvedValue([{ id: 7, name: 'Press', hash: 'SECRET-HASH', expiresAt: null, maxUses: null, useCount: 0, createdAt: 'x', updatedAt: 'y' }])
    const res = await GET()
    const text = await res.text()
    expect(text).not.toContain('SECRET-HASH')
    expect(JSON.parse(text).groups[0].content).toHaveLength(2)
    m.getAdminContext.mockResolvedValue(ctx({ isAdmin: false, can: vi.fn(() => false) }))
    expect((await GET()).status).toBe(401)
  })

  it('creates a group, hashing the password, and audits it', async () => {
    const res = await POST(json('POST', { name: ' Press ', password: 'secret1', maxUses: 3 }))
    expect(res.status).toBe(200)
    const arg = m.g.createGroup.mock.calls[0][1]
    expect(arg.name).toBe('Press')
    expect(arg.hash).toMatch(/^pbkdf2\$/)
    expect(arg.hash).not.toContain('secret1')
    expect(arg.maxUses).toBe(3)
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.created', groupId: 7 }))
    expect(JSON.stringify(m.recordGroupEvent.mock.calls)).not.toContain('secret1')
  })

  it('validates input: short password, bad expiry, bad max uses, duplicate name, no secret, switched off', async () => {
    expect((await POST(json('POST', { name: 'A', password: 'abc' }))).status).toBe(400)
    expect((await POST(json('POST', { name: 'A', password: 'secret1', expiresAt: '2000-01-01' }))).status).toBe(400)
    expect((await POST(json('POST', { name: 'A', password: 'secret1', maxUses: 0 }))).status).toBe(400)
    m.g.listGroups.mockResolvedValue([{ id: 1, name: 'a' }])
    expect((await POST(json('POST', { name: 'A', password: 'secret1' }))).status).toBe(409)
    m.g.listGroups.mockResolvedValue([])
    m.settings.mockResolvedValue({ passwordGroups: { enabled: false } })
    expect((await POST(json('POST', { name: 'A', password: 'secret1' }))).status).toBe(409)
    m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
    delete process.env.ENGAGE_SECRET
    expect((await POST(json('POST', { name: 'A', password: 'secret1' }))).status).toBe(503)
    expect(m.g.createGroup).not.toHaveBeenCalled()
  })

  it('rotate stores a new hash, audits, and purges every URL of every document in the group', async () => {
    const res = await PATCH(json('PATCH', { id: 7, password: 'brand-new' }))
    expect(res.status).toBe(200)
    expect(m.g.rotateGroupHash.mock.calls[0][2]).toMatch(/^pbkdf2\$/)
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.rotated' }))
    expect(m.purgeCache).toHaveBeenCalledWith(['/blog/secret-post', '/vault'], { force: true })
  })

  it('delete is refused while content uses the group, then purges and audits once confirmed', async () => {
    const refused = await DELETE(new Request('http://x/api/admin-password-groups?id=7', { method: 'DELETE' }))
    expect(refused.status).toBe(409)
    expect(m.g.deleteGroup).not.toHaveBeenCalled()
    const ok = await DELETE(new Request('http://x/api/admin-password-groups?id=7&confirm=1', { method: 'DELETE' }))
    expect(ok.status).toBe(200)
    expect(m.g.deleteGroup).toHaveBeenCalledWith({}, 7)
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.deleted' }))
    expect(m.purgeCache).toHaveBeenCalledWith(['/blog/secret-post', '/vault'], { force: true })
  })

  it('an unused group deletes without confirmation and purges nothing', async () => {
    m.g.listGroupMembers.mockResolvedValue([])
    const res = await DELETE(new Request('http://x/api/admin-password-groups?id=7', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(m.purgeCache).not.toHaveBeenCalled()
  })

  it('settings changes purge too, because an expiry change can lock a page', async () => {
    const res = await PATCH(json('PATCH', { id: 7, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }))
    expect(res.status).toBe(200)
    expect(m.g.updateGroupSettings).toHaveBeenCalled()
    expect(m.purgeCache).toHaveBeenCalled()
  })
})

describe('admin-visibility-access', () => {
  it('assigns a group to a document, clears its own password, purges and audits', async () => {
    const res = await accessPost(json('POST', { collection: 'posts', id: 1, mode: 'group', groupId: 7 }, 'http://x/api/admin-visibility-access'))
    expect(res.status).toBe(200)
    expect(m.g.setAccessRule).toHaveBeenCalledWith({}, expect.objectContaining({ collection: 'posts', docId: 1, mode: 'group', groupId: 7 }))
    expect(m.clearPassword).toHaveBeenCalledWith({}, 'posts', 1)
    expect(m.purgeCache).toHaveBeenCalledWith(['/blog/secret-post'], { force: true })
    expect(m.recordGroupEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'password-group.assigned', groupId: 7 }))
  })

  it('saves an accounts rule with roles and tiers, validating the names', async () => {
    const ok = await accessPost(json('POST', { collection: 'pages', id: 2, mode: 'accounts', roles: ['editor'], tiers: ['gold'] }, 'http://x/a'))
    expect(ok.status).toBe(200)
    expect(m.g.setAccessRule).toHaveBeenCalledWith({}, expect.objectContaining({ mode: 'accounts', roles: ['editor'], tiers: ['gold'], groupId: null }))
    const bad = await accessPost(json('POST', { collection: 'pages', id: 2, mode: 'accounts', roles: ['bad role!'] }, 'http://x/a'))
    expect(bad.status).toBe(400)
  })

  it('refuses without permission, without document access, a missing group, or groups switched off', async () => {
    m.getAdminContext.mockResolvedValue(ctx({ isAdmin: false, can: vi.fn(() => false) }))
    expect((await accessPost(json('POST', { collection: 'posts', id: 1, mode: 'group', groupId: 7 }, 'http://x/a'))).status).toBe(401)
    m.getAdminContext.mockResolvedValue(ctx())
    m.assertDocAccess.mockResolvedValue({ ok: false, status: 403 })
    expect((await accessPost(json('POST', { collection: 'posts', id: 1, mode: 'group', groupId: 7 }, 'http://x/a'))).status).toBe(403)
    m.assertDocAccess.mockResolvedValue({ ok: true })
    m.g.getGroup.mockResolvedValue(null)
    expect((await accessPost(json('POST', { collection: 'posts', id: 1, mode: 'group', groupId: 7 }, 'http://x/a'))).status).toBe(404)
    m.settings.mockResolvedValue({ passwordGroups: { enabled: false } })
    expect((await accessPost(json('POST', { collection: 'posts', id: 1, mode: 'group', groupId: 7 }, 'http://x/a'))).status).toBe(409)
    expect(m.g.setAccessRule).not.toHaveBeenCalled()
  })

  it('removing a rule purges the document', async () => {
    const res = await accessDelete(new Request('http://x/api/admin-visibility-access?collection=posts&id=1', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(m.g.clearAccessRule).toHaveBeenCalledWith({}, 'posts', 1)
    expect(m.purgeCache).toHaveBeenCalled()
  })
})
