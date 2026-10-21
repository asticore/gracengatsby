import { describe, expect, it } from 'vitest'

import { hoursRows, isOpenNow, nextIndex, parseTime, zonedParts } from '@/components/blocks/elements/Wave65Elements'
import { blogSlug } from '@/components/blocks/elements/Wave65Server'
import { getElementDef } from '@/lib/elements/registry'

describe('wave65 helpers', () => {
  it('parses times', () => {
    expect(parseTime('09:30')).toBe(570)
    expect(parseTime('25:00')).toBeNull()
  })
  it('finds the weekday in a zone', () => {
    const d = new Date('2026-10-21T23:30:00Z') // Wednesday UTC
    expect(zonedParts(d, 'UTC').day).toBe('wed')
    expect(zonedParts(d, 'Australia/Sydney').day).toBe('thu')
    expect(zonedParts(d, 'Not/AZone').day).toMatch(/^(wed|thu)$/)
  })
  it('computes open now, closed days and overnight spans', () => {
    const rows = hoursRows([{ day: 'wed', open: '09:00', close: '17:00' }, { day: 'thu', open: '', close: '', closed: true }, { day: 'fri', open: '22:00', close: '02:00' }])
    expect(isOpenNow(rows, new Date('2026-10-21T10:00:00Z'), 'UTC')).toBe(true)
    expect(isOpenNow(rows, new Date('2026-10-21T18:00:00Z'), 'UTC')).toBe(false)
    expect(isOpenNow(rows, new Date('2026-10-22T10:00:00Z'), 'UTC')).toBe(false)
    expect(isOpenNow(rows, new Date('2026-10-24T01:00:00Z'), 'UTC')).toBe(true)
  })
  it('wraps slide indexes', () => {
    expect(nextIndex(0, 3, -1)).toBe(2)
    expect(nextIndex(2, 3, 1)).toBe(0)
    expect(nextIndex(0, 0, 1)).toBe(0)
  })
  it('reads blog slugs', () => {
    expect(blogSlug('/blog/hello')).toBe('hello')
    expect(blogSlug('/about')).toBe('')
  })
  it('registers the elements', () => {
    for (const t of ['business-hours', 'slides', 'author-box', 'post-navigation', 'language-switcher']) expect(getElementDef(t)).toBeTruthy()
  })
})
