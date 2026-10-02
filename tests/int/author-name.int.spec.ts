import { describe, expect, it } from 'vitest'
import { resolveName } from '@/admin/views/authorName'

describe('resolveName', () => {
  it('returns Unknown for null', () => {
    expect(resolveName(null)).toBe('Unknown')
  })

  it('returns Unknown for undefined', () => {
    expect(resolveName(undefined)).toBe('Unknown')
  })

  it('returns Unknown for a plain string id', () => {
    expect(resolveName('user-123')).toBe('Unknown')
  })

  it('returns Unknown for a numeric id', () => {
    expect(resolveName(123)).toBe('Unknown')
  })

  it('returns name when the author object has a name property', () => {
    expect(resolveName({ id: 1, name: 'Alice' })).toBe('Alice')
  })

  it('returns email when the author object has no name but has email', () => {
    expect(resolveName({ id: 1, email: 'alice@example.com' })).toBe('alice@example.com')
  })

  it('prefers name over email when both are present', () => {
    expect(resolveName({ id: 1, name: 'Bob', email: 'bob@example.com' })).toBe('Bob')
  })

  it('returns Unknown for an empty object', () => {
    expect(resolveName({})).toBe('Unknown')
  })

  it('returns Unknown when name is empty string and email is empty string', () => {
    expect(resolveName({ name: '', email: '' })).toBe('Unknown')
  })

  it('ignores properties that are not name or email', () => {
    expect(resolveName({ id: 1, slug: 'alice' })).toBe('Unknown')
  })
})
