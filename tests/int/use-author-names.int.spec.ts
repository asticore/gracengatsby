import { describe, expect, it } from 'vitest'
import { pickUserName } from '@/admin/views/useAuthorNames'

describe('pickUserName (pure helper)', () => {
  it('returns name when user object has name property', () => {
    expect(pickUserName({ name: 'Alice' })).toBe('Alice')
  })

  it('returns email when user object has no name but has email', () => {
    expect(pickUserName({ email: 'alice@example.com' })).toBe('alice@example.com')
  })

  it('prefers name over email when both are present', () => {
    expect(pickUserName({ name: 'Bob', email: 'bob@example.com' })).toBe('Bob')
  })

  it('returns Unknown for null', () => {
    expect(pickUserName(null)).toBe('Unknown')
  })

  it('returns Unknown for undefined', () => {
    expect(pickUserName(undefined)).toBe('Unknown')
  })

  it('returns Unknown for numeric id', () => {
    expect(pickUserName(123)).toBe('Unknown')
  })

  it('returns Unknown for string id', () => {
    expect(pickUserName('user-123')).toBe('Unknown')
  })

  it('returns Unknown for empty object', () => {
    expect(pickUserName({})).toBe('Unknown')
  })

  it('returns Unknown when both name and email are empty strings', () => {
    expect(pickUserName({ name: '', email: '' })).toBe('Unknown')
  })

  it('handles user objects with only an id', () => {
    expect(pickUserName({ id: 1 })).toBe('Unknown')
  })

  it('handles user objects with additional properties beyond name/email', () => {
    expect(pickUserName({ id: 1, name: 'Charlie', slug: 'charlie' })).toBe('Charlie')
  })
})
