import { describe, expect, it } from 'vitest'

import { formatDateFor, priceLocale } from '@/features/uiStrings/publicFormat'
import { formatDisplayAmount } from '@/features/ecommerce/lib/displayCurrencyFormat'

describe('storefront locale formatting', () => {
  it('keeps the shop English price locale when no visitor language is set', () => {
    expect(priceLocale(null)).toBe('en-AU')
    expect(priceLocale(undefined)).toBe('en-AU')
    expect(priceLocale('de')).toBe('de')
  })

  it('formats dates the same as before without a locale', () => {
    const iso = '2026-03-04T00:00:00Z'
    const date = new Date(iso)
    expect(formatDateFor(iso, null)).toBe(date.toLocaleDateString())
    expect(formatDateFor(iso, null, { day: 'numeric', month: 'long', year: 'numeric' })).toBe(
      date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    )
  })

  it('formats dates in the visitor language when one is set', () => {
    const iso = '2026-03-04T00:00:00Z'
    expect(formatDateFor(iso, 'de', { day: 'numeric', month: 'long', year: 'numeric' })).not.toBe(
      formatDateFor(iso, 'en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    )
  })

  it('keeps the display currency English formatting by default', () => {
    expect(formatDisplayAmount(10, 'USD', 1, 2)).toBe(formatDisplayAmount(10, 'USD', 1, 2, 'en-AU'))
  })
})
