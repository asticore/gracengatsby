// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  DAY_MS,
  frequencyAllows,
  hrefOpensPopup,
  isExitIntent,
  isLikelyBot,
  popupHref,
  scrollThresholdReached,
} from '@/lib/popupTriggers'
import { parseSectionLayout } from '@/lib/sectionLayout'
import { globalCards, globalNode } from '@/views/visualEditor/libraryGlobals'

describe('popup trigger sanitiser', () => {
  it('keeps valid trigger and frequency keys', () => {
    expect(
      parseSectionLayout({ display: 'modal', popupDelay: 5, popupScroll: 40, popupExit: true, popupFrequency: 'days', popupDays: 7 }),
    ).toEqual({ display: 'modal', popupDelay: 5, popupScroll: 40, popupExit: true, popupFrequency: 'days', popupDays: 7 })
  })
  it('rejects bad values', () => {
    const out = parseSectionLayout({ display: 'modal', popupDelay: -1, popupScroll: 101, popupExit: 'yes', popupFrequency: 'hourly', popupDays: 0.5 })
    expect(out).toEqual({ display: 'modal' })
    expect(parseSectionLayout({ popupDelay: '5', popupScroll: 0, popupDays: 400 })).toBeUndefined()
    expect(parseSectionLayout({ popupDelay: 1.5 })).toBeUndefined()
  })
  it('drops the default frequency', () => {
    expect(parseSectionLayout({ popupFrequency: 'always', popupExit: false })).toBeUndefined()
  })
})

describe('popup decisions', () => {
  it('builds and matches popup hrefs', () => {
    expect(popupHref('promo')).toBe('#popup-promo')
    expect(popupHref('bad id')).toBeNull()
    expect(hrefOpensPopup('#popup-promo', 'promo')).toBe(true)
    expect(hrefOpensPopup('#popup-other', 'promo')).toBe(false)
    expect(hrefOpensPopup('#popup-promo', undefined)).toBe(false)
  })
  it('applies frequency rules', () => {
    const now = 1_000_000_000_000
    expect(frequencyAllows(undefined, undefined, { shownThisSession: true }, now)).toBe(true)
    expect(frequencyAllows('session', undefined, { shownThisSession: true }, now)).toBe(false)
    expect(frequencyAllows('session', undefined, {}, now)).toBe(true)
    expect(frequencyAllows('days', 3, {}, now)).toBe(true)
    expect(frequencyAllows('days', 3, { lastShownMs: now - 2 * DAY_MS }, now)).toBe(false)
    expect(frequencyAllows('days', 3, { lastShownMs: now - 3 * DAY_MS }, now)).toBe(true)
  })
  it('detects scroll threshold, exit intent and bots', () => {
    expect(scrollThresholdReached(500, 1000, 3000, 25)).toBe(true)
    expect(scrollThresholdReached(499, 1000, 3000, 25)).toBe(false)
    expect(scrollThresholdReached(0, 1000, 800, 10)).toBe(false)
    expect(isExitIntent(-1, true)).toBe(true)
    expect(isExitIntent(300, true)).toBe(false)
    expect(isExitIntent(0, false)).toBe(false)
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(isLikelyBot('Mozilla/5.0 Chrome/120', true)).toBe(true)
    expect(isLikelyBot('Mozilla/5.0 Chrome/120')).toBe(false)
  })
})

describe('library Global group', () => {
  it('lists reusable sections and skips junk', () => {
    expect(globalCards([{ id: 3, name: ' Footer CTA ', description: 'x' }, { id: '4', name: 'B' }, { id: 0, name: 'z' }, { id: 5 }, null])).toEqual([
      { id: 3, name: 'Footer CTA', description: 'x' },
      { id: 4, name: 'B', description: '' },
    ])
    expect(globalCards(undefined)).toEqual([])
  })
  it('inserts a reusableSection reference block', () => {
    expect(globalNode(3)).toEqual({ blockType: 'reusableSection', section: 3 })
  })
})
