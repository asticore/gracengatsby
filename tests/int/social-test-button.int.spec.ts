import { describe, expect, it } from 'vitest'

import { socialRowId, socialTestMessage } from '@/features/socialFeeds/testResult'

describe('socialTestMessage', () => {
  it('reports success with a count', () => {
    expect(socialTestMessage({ ok: true, count: 3 })).toEqual({ ok: true, text: 'Connected. Found 3 posts.' })
    expect(socialTestMessage({ ok: true, count: 1 }).text).toBe('Connected. Found 1 post.')
    expect(socialTestMessage({ ok: true }).text).toBe('Connected. Found 0 posts.')
  })
  it('shows the (already redacted) error, trimmed and capped', () => {
    expect(socialTestMessage({ ok: false, error: '  Token expired  ' })).toEqual({ ok: false, text: 'Token expired' })
    expect(socialTestMessage({ ok: false, error: 'x'.repeat(500) }).text).toHaveLength(300)
  })
  it('falls back for empty or missing results', () => {
    expect(socialTestMessage(null)).toEqual({ ok: false, text: 'Test failed.' })
    expect(socialTestMessage({ ok: false, error: '' }).text).toBe('Test failed.')
  })
  it('row id requires a saved value', () => {
    expect(socialRowId(undefined)).toBeNull()
    expect(socialRowId('')).toBeNull()
    expect(socialRowId(5)).toBe(5)
    expect(socialRowId('abc')).toBe('abc')
  })
})
