import { describe, expect, it } from 'vitest'

import { checkLockChanges, checkLockedTree, parseLocks } from '@/features/roles/locks'
import { lockGuard } from '@/features/roles/lockGuard'
import { assertDocAccess } from '@/features/roles/docAccess'

const editor = { id: 2, roles: ['editor'] }
const brand = { id: 3, roles: ['editor'], customRoleSlug: 'brand-team' }
const full = { mode: 'full', unlockRoles: ['brand-team'] }
const check = (locks: any, original: any, incoming: any) =>
  checkLockedTree({ user: editor, locks: parseLocks(locks), original, incoming, noun: 'page' })

const leaf = (id: string) => ({ blockType: 'element', elementType: 'text', _id: id, props: { text: id } })
// A keyless wrapper (no id of its own) holding children.
const wrap = (...kids: any[]) => ({ blockType: 'section', columns: [{ blocks: kids }] })

describe('lock guard: placement', () => {
  it('rejects moving a locked node between two keyless containers', () => {
    const before = [wrap(leaf('L'), leaf('x')), wrap(leaf('y'))]
    const after = [wrap(leaf('x')), wrap(leaf('L'), leaf('y'))]
    const r = check({ nodes: { L: full } }, before, after)
    expect(r.ok).toBe(false)
  })
  it('rejects reordering a locked node among its siblings', () => {
    const before = [leaf('a'), leaf('L'), leaf('b')]
    expect(check({ nodes: { L: full } }, before, [leaf('L'), leaf('a'), leaf('b')]).ok).toBe(false)
    expect(check({ nodes: { L: full } }, before, [leaf('a'), leaf('b'), leaf('L')]).ok).toBe(false)
  })
  it('still allows unrelated inserts and edits around a locked node', () => {
    const before = [leaf('a'), leaf('L'), leaf('b')]
    expect(check({ nodes: { L: full } }, before, [leaf('new'), leaf('a'), leaf('L'), leaf('b')]).ok).toBe(true)
    expect(check({ nodes: { L: full } }, before, [leaf('a'), leaf('L')]).ok).toBe(true)
  })
  it('lets an unlock role reorder', () => {
    const before = [leaf('a'), leaf('L')]
    const r = checkLockedTree({ user: brand, locks: parseLocks({ nodes: { L: full } }), original: before, incoming: [leaf('L'), leaf('a')], noun: 'page' })
    expect(r.ok).toBe(true)
  })
})

describe('lock changes', () => {
  const was = parseLocks({ nodes: { s1: full } })
  const none = parseLocks({})
  it('a lock manager without the unlock role cannot remove or weaken an existing lock', () => {
    expect(checkLockChanges({ user: editor, canManage: true, original: was, incoming: none }).ok).toBe(false)
    const weaker = parseLocks({ nodes: { s1: { mode: 'structure', unlockRoles: ['brand-team'], editableProps: ['text'] } } })
    expect(checkLockChanges({ user: editor, canManage: true, original: was, incoming: weaker }).ok).toBe(false)
  })
  it('a role named in the lock may change it; a manager may add new locks', () => {
    expect(checkLockChanges({ user: brand, canManage: false, original: was, incoming: none }).ok).toBe(true)
    expect(checkLockChanges({ user: editor, canManage: true, original: none, incoming: was }).ok).toBe(true)
    expect(checkLockChanges({ user: editor, canManage: false, original: none, incoming: was }).ok).toBe(false)
  })
})

describe('lock guard: drafts', () => {
  const blocks = [leaf('L')]
  const edited = [{ ...leaf('L'), props: { text: 'changed' } }]
  const collection = { slug: 'pages', versions: { drafts: true } }
  it('uses the latest draft version locks, not only the live row', async () => {
    const latest = { id: 7, blocks, locks: { nodes: { L: full } } }
    const req = { user: editor, engine: { findByID: async (a: any) => (a.draft ? latest : null) } }
    await expect(
      (lockGuard as any)({ data: { blocks: edited, _status: 'draft' }, originalDoc: { id: 7, blocks }, req, operation: 'update', collection }),
    ).rejects.toMatchObject({ name: 'Forbidden' })
  })
  it('falls back to the live row when the draft lookup fails', async () => {
    const req = { user: editor, engine: { findByID: async () => { throw new Error('x') } } }
    await expect(
      (lockGuard as any)({ data: { blocks: edited }, originalDoc: { id: 7, blocks, locks: { nodes: { L: full } } }, req, operation: 'update', collection }),
    ).rejects.toMatchObject({ name: 'Forbidden' })
  })
})

describe('assertDocAccess', () => {
  const ownRole = { id: 5, roles: ["editor"] as string[] }
  const custom = { id: 5, roles: [] as string[], customRolePermissions: { pages: { read: true, update: true, scope: 'own' } } }
  const engineWith = (createdBy: unknown) => ({ findByID: async () => ({ id: 1, createdBy }) })

  it('admin and unrestricted users pass without a lookup', async () => {
    expect((await assertDocAccess({ isAdmin: true }, 'pages', 1)).ok).toBe(true)
    expect((await assertDocAccess({ user: ownRole }, 'pages', 1)).ok).toBe(true)
  })
  it('own-scoped user may act on own documents only', async () => {
    expect((await assertDocAccess({ user: custom, engine: engineWith(5) }, 'pages', 1)).ok).toBe(true)
    expect((await assertDocAccess({ user: custom, engine: engineWith({ id: 5 }) }, 'pages', 1)).ok).toBe(true)
    expect(await assertDocAccess({ user: custom, engine: engineWith(9) }, 'pages', 1)).toEqual({ ok: false, status: 403 })
    expect(await assertDocAccess({ user: custom, engine: engineWith(null) }, 'pages', 1)).toEqual({ ok: false, status: 403 })
    expect(await assertDocAccess({ user: custom, engine: { findByID: async () => null } }, 'pages', 1)).toEqual({ ok: false, status: 404 })
  })
  it('fails closed for collections that cannot be scoped', async () => {
    const u = { id: 5, roles: [] as string[], customRolePermissions: { faqs: { update: true, scope: 'own' } } }
    expect(await assertDocAccess({ user: u, engine: engineWith(5) }, 'faqs', 1)).toEqual({ ok: false, status: 403 })
  })
})
