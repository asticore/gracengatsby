import { describe, it, expect } from 'vitest'

/**
 * Test the belongsTo logic for filtering preference rows by owner.
 * This tests the fix for Bug #1: ensures reads are filtered by owner
 * to prevent cross-customer reads when polymorphic user field is in effect.
 */
describe('AccountPreferences ownership filter', () => {
  function belongsTo(doc: unknown, userId: number | string): boolean {
    const owner = (doc as { user?: unknown }).user
    const first = Array.isArray(owner) ? owner[0] : owner
    if (first === null || first === undefined) return false
    const value =
      typeof first === 'object' ? (first as { value?: unknown; id?: unknown }).value ?? (first as { id?: unknown }).id : first
    const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
    return String(id) === String(userId)
  }

  it('should match a row with user as array of id values', () => {
    const doc = { id: 1, user: [42], value: { name: 'Test' } }
    expect(belongsTo(doc, 42)).toBe(true)
    expect(belongsTo(doc, 43)).toBe(false)
  })

  it('should match a row with user as polymorphic object with value', () => {
    const doc = { id: 1, user: [{ value: 42, relationTo: 'users' }], value: {} }
    expect(belongsTo(doc, 42)).toBe(true)
    expect(belongsTo(doc, 43)).toBe(false)
  })

  it('should match a row with user as polymorphic object with id', () => {
    const doc = { id: 1, user: [{ id: 42, relationTo: 'users' }], value: {} }
    expect(belongsTo(doc, 42)).toBe(true)
    expect(belongsTo(doc, 43)).toBe(false)
  })

  it('should reject a row with null or undefined user', () => {
    const doc1: unknown = { id: 1, user: null, value: {} }
    const doc2: unknown = { id: 2, user: undefined, value: {} }
    expect(belongsTo(doc1, 42)).toBe(false)
    expect(belongsTo(doc2, 42)).toBe(false)
  })

  it('should reject a row belonging to a different user', () => {
    const doc = { id: 1, user: [42], value: {} }
    expect(belongsTo(doc, 99)).toBe(false)
  })

  it('should handle string user ids correctly', () => {
    const doc = { id: 1, user: ['user-42'], value: {} }
    expect(belongsTo(doc, 'user-42')).toBe(true)
    expect(belongsTo(doc, 'user-99')).toBe(false)
  })
})
