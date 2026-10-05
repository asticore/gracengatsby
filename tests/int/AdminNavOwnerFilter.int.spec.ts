import { describe, it, expect } from 'vitest'

/**
 * Test the belongsTo logic for filtering nav preference rows by owner.
 * This tests the fix for Bug #2: ensures the where-builder limitation
 * (cannot map polymorphic user.relationTo/user.value) is worked around
 * by filtering in code after the query.
 */
describe('AdminNav ownership filter', () => {
  function belongsTo(doc: unknown, user: { collection: string; id: number | string }): boolean {
    const owner = (doc as { user?: unknown }).user
    const first = Array.isArray(owner) ? owner[0] : owner
    if (first === null || first === undefined) return false
    const value =
      typeof first === 'object' ? (first as { value?: unknown; id?: unknown }).value ?? (first as { id?: unknown }).id : first
    const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
    return String(id) === String(user.id)
  }

  it('should match a nav pref row with user as array of id values', () => {
    const doc = { id: 1, key: 'nav', user: [42], value: { groups: { Content: { open: true } } } }
    const user = { collection: 'users', id: 42 }
    expect(belongsTo(doc, user)).toBe(true)
    expect(belongsTo(doc, { collection: 'users', id: 43 })).toBe(false)
  })

  it('should match a nav pref row with polymorphic user object', () => {
    const doc = { id: 1, key: 'nav', user: [{ value: 42, relationTo: 'users' }], value: {} }
    const user = { collection: 'users', id: 42 }
    expect(belongsTo(doc, user)).toBe(true)
  })

  it('should match a nav pref row with polymorphic user using id field', () => {
    const doc = { id: 1, key: 'nav', user: [{ id: 42, relationTo: 'users' }], value: {} }
    const user = { collection: 'users', id: 42 }
    expect(belongsTo(doc, user)).toBe(true)
  })

  it('should reject rows with null or undefined user', () => {
    const user = { collection: 'users', id: 42 }
    expect(belongsTo({ id: 1, user: null, value: {} }, user)).toBe(false)
    expect(belongsTo({ id: 2, user: undefined, value: {} }, user)).toBe(false)
  })

  it('should prevent cross-customer reads - reject different user', () => {
    const doc = { id: 1, key: 'nav', user: [99], value: { groups: { Settings: { open: true } } } }
    const user = { collection: 'users', id: 42 }
    expect(belongsTo(doc, user)).toBe(false)
  })

  it('should handle string user ids in nav prefs', () => {
    const doc = { id: 1, key: 'nav', user: ['admin-user-42'], value: {} }
    const user = { collection: 'users', id: 'admin-user-42' }
    expect(belongsTo(doc, user)).toBe(true)
  })
})
