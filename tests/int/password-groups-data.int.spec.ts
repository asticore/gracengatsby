// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import {
  CONTENT_ACCESS_TABLE,
  PASSWORD_GROUPS_TABLE,
  PASSWORD_GROUP_INDEXES,
} from '@/migrations/20261123_100000_password_groups'
import {
  clearAccessRule,
  consumeGroupUse,
  createGroup,
  deleteGroup,
  getAccessRule,
  getGroup,
  listGroupMembers,
  listGroups,
  rotateGroupHash,
  setAccessRule,
  updateGroupSettings,
} from '@/cms/db/passwordGroups'
import { DEFAULT_SECURITY_SETTINGS, passwordGroupsFrom, rowToSettings } from '@/features/security/settings'
import { AUTH_AUDIT_ACTIONS } from '@/features/security/auditLog'

describe('password group data layer on a real D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: never

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    for (const statement of [PASSWORD_GROUPS_TABLE, CONTENT_ACCESS_TABLE, ...PASSWORD_GROUP_INDEXES]) {
      await proxy.env.D1.prepare(statement).run()
    }
    const { drizzle } = await import('drizzle-orm/d1')
    db = drizzle(proxy.env.D1) as never
  }, 120_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('creates, lists and rotates a group; rotating resets the use counter and changes the hash', async () => {
    const id = await createGroup(db, { name: 'Press', hash: 'h1', expiresAt: null, maxUses: 2 })
    expect(id).toBeGreaterThan(0)
    expect((await listGroups(db)).map((g) => g.name)).toContain('Press')
    expect(await consumeGroupUse(db, id)).toBe(true)
    expect((await getGroup(db, id))?.useCount).toBe(1)
    await rotateGroupHash(db, id, 'h2')
    const rotated = await getGroup(db, id)
    expect(rotated?.hash).toBe('h2')
    expect(rotated?.useCount).toBe(0)
  })

  it('refuses a second group with the same name', async () => {
    await createGroup(db, { name: 'Unique', hash: 'x', expiresAt: null, maxUses: null })
    await expect(createGroup(db, { name: 'Unique', hash: 'y', expiresAt: null, maxUses: null })).rejects.toThrow()
  })

  it('enforces the use cap atomically', async () => {
    const id = await createGroup(db, { name: 'Capped', hash: 'h', expiresAt: null, maxUses: 2 })
    const results = await Promise.all([consumeGroupUse(db, id), consumeGroupUse(db, id), consumeGroupUse(db, id), consumeGroupUse(db, id)])
    expect(results.filter(Boolean)).toHaveLength(2)
    expect((await getGroup(db, id))?.useCount).toBe(2)
    const current = (await getGroup(db, id))!
    await updateGroupSettings(db, id, { resetUses: true, maxUses: 5 }, current)
    expect(await consumeGroupUse(db, id)).toBe(true)
  })

  it('tracks which documents use a group, and delete releases them', async () => {
    const id = await createGroup(db, { name: 'Members', hash: 'h', expiresAt: null, maxUses: null })
    await setAccessRule(db, { collection: 'posts', docId: 1, mode: 'group', groupId: id, roles: [], tiers: [] })
    await setAccessRule(db, { collection: 'pages', docId: 2, mode: 'accounts', groupId: id, roles: ['editor'], tiers: ['gold'] })
    expect(await listGroupMembers(db, id)).toEqual([
      { collection: 'pages', docId: 2 },
      { collection: 'posts', docId: 1 },
    ])
    expect(await getAccessRule(db, 'pages', 2)).toMatchObject({ mode: 'accounts', roles: ['editor'], tiers: ['gold'], groupId: id })
    await deleteGroup(db, id)
    expect(await getGroup(db, id)).toBeNull()
    expect(await getAccessRule(db, 'posts', 1)).toBeNull()
    // an accounts rule survives, without the dangling group reference
    expect(await getAccessRule(db, 'pages', 2)).toMatchObject({ mode: 'accounts', groupId: null })
    await clearAccessRule(db, 'pages', 2)
    expect(await getAccessRule(db, 'pages', 2)).toBeNull()
  })

  it('setAccessRule replaces an existing rule for the same document', async () => {
    await setAccessRule(db, { collection: 'events', docId: 8, mode: 'accounts', groupId: null, roles: ['a'], tiers: [] })
    await setAccessRule(db, { collection: 'events', docId: 8, mode: 'accounts', groupId: null, roles: ['b'], tiers: [] })
    expect((await getAccessRule(db, 'events', 8))?.roles).toEqual(['b'])
  })
})

describe('security settings toggle and audit actions', () => {
  it('group passwords are on by default and only an explicit off switches them off', () => {
    expect(DEFAULT_SECURITY_SETTINGS.passwordGroups.enabled).toBe(true)
    expect(rowToSettings(null, true).passwordGroups.enabled).toBe(true)
    expect(rowToSettings({ password_groups_enabled: 1 }, true).passwordGroups.enabled).toBe(true)
    expect(rowToSettings({ password_groups_enabled: 0 }, true).passwordGroups.enabled).toBe(false)
    expect(passwordGroupsFrom(() => undefined).enabled).toBe(true)
    expect(passwordGroupsFrom((k) => (k === 'password_groups_enabled' ? false : undefined)).enabled).toBe(false)
  })

  it('every password group event is listed on the audit review screen', () => {
    for (const action of ['created', 'rotated', 'updated', 'deleted', 'assigned', 'unlock', 'unlock-failed', 'refused']) {
      expect(AUTH_AUDIT_ACTIONS).toContain(`password-group.${action}`)
    }
  })
})
