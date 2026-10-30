import { describe, expect, it } from 'vitest'

import { addEach } from '@/features/tracking/bulk'
import { validateTrackingEvent } from '@/features/tracking/events'

describe('Add all runs every suggestion and reports each row', () => {
  it('saves each row in order and counts the successes', async () => {
    const saved: number[] = []
    const result = await addEach([10, 20, 30], async (item) => {
      saved.push(item)
      return null
    })
    expect(saved).toEqual([10, 20, 30])
    expect(result).toEqual({ added: 3, failed: 0, errors: [] })
  })

  it('reports a failed row with its message and still saves the rest', async () => {
    const rows: string[] = []
    const result = await addEach(['a', 'b', 'c'], async (item) => (item === 'b' ? 'The CSS selector is not valid.' : null), (index, outcome) => rows.push(`${index}:${outcome}`))
    expect(result.added).toEqual(2)
    expect(result.failed).toEqual(1)
    expect(result.errors).toEqual([{ index: 1, message: 'The CSS selector is not valid.' }])
    expect(rows).toEqual(['0:ok', '1:error', '2:ok'])
  })

  it('a save that throws counts as failed, not as a stopped run', async () => {
    const result = await addEach([1, 2], async (item) => {
      if (item === 1) throw new Error('network down')
      return null
    })
    expect(result.failed).toBe(1)
    expect(result.added).toBe(1)
  })

  it('an empty list adds nothing and reports nothing', async () => {
    expect(await addEach([], async () => null)).toEqual({ added: 0, failed: 0, errors: [] })
  })
})

describe('the selectors the scan produces are accepted by the API', () => {
  const base = { name: 'Tag', platformEvent: 'Custom' as const, triggerType: 'click' as const, urlMatchMode: 'exact' as const, urlMatch: '/shop' }

  it('accepts a data-attribute selector with quotes, which the picker writes', () => {
    expect(validateTrackingEvent({ ...base, selector: 'button[data-eg-block="hero-cta"]' })).toEqual([])
    expect(validateTrackingEvent({ ...base, selector: 'a[href="/checkout"]' })).toEqual([])
  })

  it('still refuses markup and rule syntax', () => {
    expect(validateTrackingEvent({ ...base, selector: 'a{color:red}' }).join(' ')).toMatch(/not valid/)
    expect(validateTrackingEvent({ ...base, selector: '<script>' }).join(' ')).toMatch(/not valid/)
  })
})
