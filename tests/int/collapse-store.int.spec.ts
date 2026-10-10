import { describe, expect, it } from 'vitest'
import { applyCardOp, sanitizeCardIds } from '@/admin/components/collapseStore'

describe('sanitizeCardIds', () => {
  it('keeps valid unique ids and drops the rest', () => {
    expect(sanitizeCardIds(['settings', 'settings', 'bad id', 'outline:0.1', 3])).toEqual(['settings', 'outline:0.1'])
  })

  it('returns empty for non-array input', () => {
    expect(sanitizeCardIds(undefined)).toEqual([])
    expect(sanitizeCardIds('settings')).toEqual([])
  })

  it('caps at 100 ids', () => {
    expect(sanitizeCardIds(Array.from({ length: 120 }, (_, i) => `c${i}`))).toHaveLength(100)
  })
})

describe('applyCardOp', () => {
  it('adds and removes ids without mutating the input set', () => {
    const start = new Set(['a'])
    const closed = applyCardOp(start, { type: 'set', ids: ['b', 'c'], closed: true })
    expect([...closed].sort()).toEqual(['a', 'b', 'c'])
    expect([...start]).toEqual(['a'])

    const reopened = applyCardOp(closed, { type: 'set', ids: ['a', 'x'], closed: false })
    expect([...reopened].sort()).toEqual(['b', 'c'])
  })

  it('clear empties the set', () => {
    expect(applyCardOp(new Set(['a', 'b']), { type: 'clear' }).size).toBe(0)
  })
})
