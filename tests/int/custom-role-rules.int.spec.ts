// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'

import { roleAccess, roleOrPublished } from '@/access/ecommerceAccess'
import { can, resolveAccess, PERMISSION_CATEGORIES, RESOURCES } from '@/features/roles/permissions'
import { attachCustomRole, invalidateCustomRole, resetCustomRoleCache, sanitizeRolePermissions } from '@/features/roles/customRoleCache'
import { setScope, getScope } from '@/features/roles/permissionTable'
import { checkLockChanges, checkLockedTree, parseLocks, type Locks } from '@/features/roles/locks'
import { lockGuard } from '@/features/roles/lockGuard'
import { effectiveLock, canInsertInto } from '@/views/visualEditor/lockState'

const customUser = (perms: unknown, extra: Record<string, unknown> = {}) => ({ id: 7, roles: ['customer'], customRoleSlug: 'brand', customRolePermissions: perms, ...extra })
const call = (fn: any, user: unknown) => fn({ req: { user } })

describe('custom role in access functions', () => {
  it('can() reads the matrix carried on the user', () => {
    const u = customUser({ pages: { read: true, update: true } })
    expect(can(u, 'pages', 'update')).toBe(true)
    expect(can(u, 'pages', 'delete')).toBe(false)
  })
  it('roleAccess / roleOrPublished use it; no matrix fails closed', () => {
    expect(call(roleAccess('pages', 'update'), customUser({ pages: { update: true } }))).toBe(true)
    expect(call(roleAccess('pages', 'update'), customUser({}))).toBe(false)
    expect(call(roleOrPublished('pages'), customUser({ pages: { read: true } }))).toBe(true)
    expect(call(roleOrPublished('pages'), customUser({}))).toEqual({ _status: { equals: 'published' } })
  })
  it('deny override beats custom grant; secret resources stay denied', () => {
    const u = customUser({ pages: { update: true }, users: { read: true } }, { permissionOverrides: { deny: { pages: { update: true } } } })
    expect(can(u, 'pages', 'update')).toBe(false)
    expect(can(u, 'users', 'read')).toBe(false)
  })
  it('own scope becomes a createdBy where; built-in role grant stays unrestricted', () => {
    const own = customUser({ pages: { read: true, update: true, scope: 'own' } })
    expect(call(roleAccess('pages', 'update'), own)).toEqual({ createdBy: { equals: 7 } })
    expect(call(roleOrPublished('pages'), own)).toEqual({ or: [{ createdBy: { equals: 7 } }, { _status: { equals: 'published' } }] })
    expect(resolveAccess({ ...own, roles: ['editor'] }, 'pages', 'update')).toBe('all')
    expect(call(roleAccess('faqs', 'update'), customUser({ faqs: { update: true, scope: 'own' } }))).toBe(false)
  })
  it('matrix scope helpers and sanitising', () => {
    expect(getScope(setScope({ pages: { read: true } }, 'pages', 'own'), 'pages')).toBe('own')
    expect(setScope({}, 'faqs', 'own').faqs?.scope).toBeUndefined()
    const clean = sanitizeRolePermissions({ pages: { read: true, scope: 'own', bogus: 1 }, nope: { read: true }, faqs: { read: true, scope: 'own' } })
    expect(clean.pages).toEqual({ read: true, scope: 'own' })
    expect(clean.faqs).toEqual({ read: true })
    expect((clean as any).nope).toBeUndefined()
  })
  it('locks is a permission resource shown in the matrix', () => {
    expect(RESOURCES).toContain('locks')
    expect(PERMISSION_CATEGORIES.some((c) => c.rows.some((r) => r.resource === 'locks'))).toBe(true)
  })
})

describe('attachCustomRole cache', () => {
  beforeEach(() => resetCustomRoleCache())
  it('attaches once, invalidates, fails closed', async () => {
    let reads = 0
    let row: any = { slug: 'brand', permissions: { pages: { read: true } } }
    const engine = { findByID: async () => { reads++; return row } }
    const u1: any = await attachCustomRole(engine, { id: 1, customRole: 3 })
    await attachCustomRole(engine, { id: 1, customRole: 3 })
    expect(reads).toBe(1)
    expect(u1.customRolePermissions.pages.read).toBe(true)
    expect(u1.customRoleSlug).toBe('brand')
    row = { slug: 'brand', permissions: { pages: { read: false } } }
    invalidateCustomRole(3)
    expect(((await attachCustomRole(engine, { id: 1, customRole: 3 })) as any).customRolePermissions.pages.read).toBe(false)
    resetCustomRoleCache()
    const broken: any = await attachCustomRole({ findByID: async () => { throw new Error('db') } }, { id: 1, customRole: 3 })
    expect(broken.customRolePermissions).toEqual({})
    expect(((await attachCustomRole(engine, { id: 2 })) as any).customRolePermissions).toBeUndefined()
  })
})

const section = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  blockType: 'section', _id: id, columns: [{ _id: `${id}c`, blocks: [{ blockType: 'element', elementType: 'heading', _id: `${id}h`, props: { text, level: 2 }, design: { padding: 4 } }] }], ...extra,
})
const page = (...nodes: any[]) => [{ blockType: 'hero', id: 'top1', headline: 'Hi' }, ...nodes]
const editor = { id: 2, roles: ['editor'] }
const brand = { id: 3, roles: ['editor'], customRoleSlug: 'brand-team' }
const admin = { id: 1, roles: ['admin'] }
const locksOf = (nodes: Record<string, any>, document?: any): Locks => parseLocks({ nodes, document })
const check = (user: any, locks: Locks, original: any, incoming: any) => checkLockedTree({ user, locks, original, incoming, noun: 'page' })

describe('lock guard matrix', () => {
  const full = { mode: 'full', unlockRoles: ['brand-team'] }
  const structure = { mode: 'structure', unlockRoles: ['brand-team'], editableProps: ['text'] }
  const orig = page(section('s1', 'Hello'))

  it('full lock: any change rejected naming the section; unlock role and admin pass', () => {
    const edited = page(section('s1', 'Changed'))
    const r = check(editor, locksOf({ s1: full }), orig, edited) as any
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Section "section"')
    expect(r.message).toContain('brand-team')
    expect(check(brand, locksOf({ s1: full }), orig, edited).ok).toBe(true)
    expect(check(admin, locksOf({ s1: full }), orig, edited).ok).toBe(true)
  })
  it('structure lock: editable text passes, styling/structure/removal/other props rejected', () => {
    const l = locksOf({ s1: structure })
    expect(check(editor, l, orig, page(section('s1', 'New text'))).ok).toBe(true)
    const restyled = page(section('s1', 'Hello'))
    ;(restyled[1] as any).columns[0].blocks[0].design = { padding: 40 }
    expect(check(editor, l, orig, restyled).ok).toBe(false)
    const lvl = page(section('s1', 'Hello'))
    ;(lvl[1] as any).columns[0].blocks[0].props.level = 3
    expect(check(editor, l, orig, lvl).ok).toBe(false)
    const added = page(section('s1', 'Hello'))
    ;(added[1] as any).columns[0].blocks.push({ blockType: 'element', elementType: 'heading', props: { text: 'x' } })
    expect(check(editor, l, orig, added).ok).toBe(false)
    expect(check(editor, l, orig, [orig[0]]).ok).toBe(false)
  })
  it('allows editing around a locked section, ignores null/empty normalisation and editor ids', () => {
    const l = locksOf({ s1: full })
    const around = [{ ...orig[0], headline: 'Other' }, ...orig.slice(1), section('s2', 'New')]
    expect(check(editor, l, orig, around).ok).toBe(true)
    const noisy = page(section('s1', 'Hello', { design: null, extra: [] }))
    ;(noisy[1] as any).columns[0]._id = 'regenerated'
    expect(check(editor, l, orig, noisy).ok).toBe(true)
  })
  it('moving a locked section into another parent is rejected', () => {
    const o = page(section('s1', 'A'), section('s2', 'B'))
    const moved = [o[0], { ...(o[2] as any), columns: [{ ...(o[2] as any).columns[0], blocks: [...(o[2] as any).columns[0].blocks, o[1]] }] }]
    expect(check(editor, locksOf({ s1: full }), o, moved).ok).toBe(false)
  })
  it('document lock: full blocks all, structure allows chosen text', () => {
    expect(check(editor, locksOf({}, { mode: 'full', unlockRoles: [] }), orig, page(section('s1', 'X'))).ok).toBe(false)
    expect(check(editor, locksOf({}, { mode: 'structure', unlockRoles: [], editableProps: ['text'] }), orig, page(section('s1', 'X'))).ok).toBe(true)
  })
  it('malformed locks fail closed (admins only)', () => {
    for (const bad of ['{not json', '[]', 42, { nodes: 'x' }, { nodes: { s1: { mode: 'weird' } } }]) {
      const l = parseLocks(bad)
      const target = bad && (bad as any).nodes ? orig : orig
      expect(check(editor, l, target, page(section('s1', 'X'))).ok, JSON.stringify(bad)).toBe(false)
      expect(check(admin, l, target, page(section('s1', 'X'))).ok).toBe(true)
    }
  })
  it('oversized trees are refused', () => {
    const big = page(...Array.from({ length: 6000 }, (_, i) => ({ blockType: 'rich', id: `b${i}` })))
    expect(check(editor, locksOf({ s1: full }), big, big).ok).toBe(false)
  })
  it('changing locks needs admin, locks permission or being named on the lock', () => {
    const was = locksOf({ s1: full })
    const none = locksOf({})
    expect(checkLockChanges({ user: editor, canManage: false, original: was, incoming: none }).ok).toBe(false)
    expect(checkLockChanges({ user: brand, canManage: false, original: was, incoming: none }).ok).toBe(true)
    expect(checkLockChanges({ user: editor, canManage: true, original: none, incoming: was }).ok).toBe(true)
    expect(checkLockChanges({ user: editor, canManage: false, original: none, incoming: was }).ok).toBe(false)
  })
  it('hook: 403 Forbidden on locked edit, stored locks decide, admin and system skip', async () => {
    const run = (user: any, data: any, originalDoc: any, operation = 'update') =>
      (lockGuard as any)({ data, originalDoc, req: { user }, operation, collection: { slug: 'pages' } })
    const originalDoc = { blocks: orig, locks: { nodes: { s1: full } } }
    await expect(run(editor, { blocks: page(section('s1', 'X')), locks: { nodes: {} } }, originalDoc)).rejects.toMatchObject({ name: 'Forbidden' })
    await expect(run(editor, { blocks: page(section('s1', 'X')) }, originalDoc)).rejects.toThrow(/locked/)
    await expect(run(brand, { blocks: page(section('s1', 'X')) }, originalDoc)).resolves.toBeUndefined()
    await expect(run(admin, { blocks: page(section('s1', 'X')) }, originalDoc)).resolves.toBeUndefined()
    await expect(run(null, { blocks: page(section('s1', 'X')) }, originalDoc)).resolves.toBeUndefined()
    await expect(run(editor, { locks: { nodes: { s1: full } } }, { blocks: orig }, 'create')).rejects.toMatchObject({ name: 'Forbidden' })
    const withLocks = { ...editor, customRolePermissions: { locks: { update: true } } }
    await expect(run(withLocks, { locks: { nodes: { s1: full } } }, { blocks: orig })).resolves.toBeUndefined()
  })
})

describe('editor lock state', () => {
  it('shows locks, inherited locks, and disables for non-permitted users only', () => {
    const blocks: any[] = [{ blockType: 'hero', id: 's1', ...{} }, section('n1', 'A')]
    const locks = locksOf({ s1: { mode: 'full', unlockRoles: ['brand-team'] }, n1: { mode: 'structure', unlockRoles: [], editableProps: ['text'] } })
    expect(effectiveLock(blocks, [0], locks, editor)).toMatchObject({ mode: 'full', blocked: true, source: 'self' })
    expect(effectiveLock(blocks, [0], locks, brand)?.blocked).toBe(false)
    expect(effectiveLock(blocks, [1, 0, 0], locks, editor)).toMatchObject({ source: 'inherited', blocked: true })
    expect(effectiveLock(blocks, [1], locks, admin)?.blocked).toBe(false)
    expect(canInsertInto(blocks, [1, 0], locks, editor)).toBe(false)
    expect(canInsertInto(blocks, [1, 0], locks, admin)).toBe(true)
  })
})
