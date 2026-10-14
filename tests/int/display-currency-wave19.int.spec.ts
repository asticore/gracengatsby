// @vitest-environment node
// Display currencies (wave 19): conversion, rounding, validation and which currencies a shopper sees.
import { describe, expect, it } from 'vitest'

import { convertForDisplay, effectiveRate, hoursSince, minorDigits, normaliseDisplayCode, parseRate, pickSelected } from '@/features/ecommerce/lib/displayCurrency'
import { formatDisplayAmount } from '@/features/ecommerce/lib/displayCurrencyFormat'
import { validateDisplayCurrencies } from '@/features/ecommerce/lib/displayCurrencyRows'
import { storefrontOptions, type DisplayCurrencyRow } from '@/features/ecommerce/server/displayCurrencies'

const row = (over: Partial<DisplayCurrencyRow>): DisplayCurrencyRow => ({
  code: 'USD',
  enabled: 1,
  sort_order: 0,
  rate_mode: 'manual',
  manual_rate: 0.66,
  auto_rate: null,
  auto_rate_base: null,
  auto_rate_at: null,
  ...over,
})

describe('minor units', () => {
  it('uses each currency own decimal places', () => {
    expect(minorDigits('AUD')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('KWD')).toBe(3)
  })
})

describe('convertForDisplay', () => {
  it('converts and rounds to the currency decimals, half away from zero', () => {
    expect(convertForDisplay(10, 0.66, 2)).toBe(6.6)
    expect(convertForDisplay(29.99, 0.66, 2)).toBe(19.79)
    expect(convertForDisplay(1, 150, 0)).toBe(150)
    expect(convertForDisplay(0.5, 1, 0)).toBe(1)
    expect(convertForDisplay(-0.5, 1, 0)).toBe(-1)
  })

  it('rounds the way a person expects for values that sit on a half cent', () => {
    expect(convertForDisplay(2.675, 1, 2)).toBe(2.68)
    expect(convertForDisplay(1.005, 1, 2)).toBe(1.01)
  })

  it('keeps the three decimals of KWD', () => {
    expect(convertForDisplay(10, 0.2, 3)).toBe(2)
    expect(convertForDisplay(10.01, 0.2, 3)).toBe(2.002)
  })

  it('returns null for missing amounts', () => {
    expect(convertForDisplay(null, 2, 2)).toBeNull()
    expect(convertForDisplay(undefined, 2, 2)).toBeNull()
    expect(convertForDisplay(Number.NaN, 2, 2)).toBeNull()
  })
})

describe('formatDisplayAmount', () => {
  it('labels converted amounts approx. and uses the currency decimals', () => {
    const jpy = formatDisplayAmount(10, 'JPY', 150, 0)
    expect(jpy).toContain('approx.')
    expect(jpy.replace(' approx.', '')).not.toContain('.')
    expect(formatDisplayAmount(10, 'USD', 0.66)).toContain('6.60')
    expect(formatDisplayAmount(null, 'USD', 0.66)).toBe('-')
  })
})

describe('rates and input', () => {
  it('accepts positive finite rates only', () => {
    expect(parseRate('0.66')).toBe(0.66)
    expect(parseRate(0)).toBeNull()
    expect(parseRate(-1)).toBeNull()
    expect(parseRate('abc')).toBeNull()
    expect(parseRate(1e9)).toBeNull()
  })

  it('uses the automatic rate only in auto mode', () => {
    expect(effectiveRate({ rate_mode: 'manual', manual_rate: 2, auto_rate: 3 })).toBe(2)
    expect(effectiveRate({ rate_mode: 'auto', manual_rate: 2, auto_rate: 3 })).toBe(3)
    expect(effectiveRate({ rate_mode: 'auto', manual_rate: 2, auto_rate: null })).toBeNull()
  })

  it('normalises codes and only honours a listed cookie value', () => {
    expect(normaliseDisplayCode(' usd ')).toBe('USD')
    expect(normaliseDisplayCode('US')).toBeNull()
    expect(normaliseDisplayCode('U$D')).toBeNull()
    const options = [{ code: 'USD', rate: 0.66, digits: 2 }]
    expect(pickSelected('USD', options)).toBe('USD')
    expect(pickSelected('EUR', options)).toBeNull()
    expect(pickSelected(undefined, options)).toBeNull()
  })

  it('counts hours since a stamp, and treats a missing stamp as very old', () => {
    const now = new Date('2026-10-14T12:00:00Z')
    expect(hoursSince('2026-10-13T12:00:00Z', now)).toBe(24)
    expect(hoursSince(null, now)).toBe(Number.POSITIVE_INFINITY)
    expect(hoursSince('not a date', now)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('validateDisplayCurrencies', () => {
  it('accepts a sensible list and keeps its order', () => {
    const result = validateDisplayCurrencies(
      [
        { code: 'usd', enabled: true, rateMode: 'manual', manualRate: '0.66' },
        { code: 'NZD', enabled: true, rateMode: 'auto', manualRate: null },
      ],
      'AUD',
    )
    expect(result.error).toBeNull()
    expect(result.rows.map((r) => r.code)).toEqual(['USD', 'NZD'])
    expect(result.rows[0].manualRate).toBe(0.66)
  })

  it('refuses the shop currency, duplicates and bad codes', () => {
    expect(validateDisplayCurrencies([{ code: 'AUD', rateMode: 'auto' }], 'AUD').error).toContain('already the shop currency')
    expect(validateDisplayCurrencies([{ code: 'USD', rateMode: 'auto' }, { code: 'usd', rateMode: 'auto' }], 'AUD').error).toContain('more than once')
    expect(validateDisplayCurrencies([{ code: 'DOLLARS', rateMode: 'auto' }], 'AUD').error).toContain('three letters')
    expect(validateDisplayCurrencies('nope', 'AUD').error).toBeTruthy()
  })

  it('needs a rate for a manual currency that is switched on', () => {
    const result = validateDisplayCurrencies([{ code: 'USD', enabled: true, rateMode: 'manual', manualRate: '' }], 'AUD')
    expect(result.error).toContain('Type the exchange rate for USD')
    expect(validateDisplayCurrencies([{ code: 'USD', enabled: false, rateMode: 'manual', manualRate: null }], 'AUD').error).toBeNull()
  })

  it('refuses a rate that is not a number above zero', () => {
    expect(validateDisplayCurrencies([{ code: 'USD', enabled: true, rateMode: 'manual', manualRate: '-2' }], 'AUD').error).toContain('greater than zero')
  })

  it('caps the list length', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ code: `C${String.fromCharCode(65 + i)}X`, rateMode: 'auto' }))
    expect(validateDisplayCurrencies(many, 'AUD').error).toContain('up to 12')
  })
})

describe('storefrontOptions', () => {
  it('lists only enabled currencies with a usable rate', () => {
    const options = storefrontOptions(
      [
        row({ code: 'USD', manual_rate: 0.66 }),
        row({ code: 'JPY', manual_rate: 100 }),
        row({ code: 'EUR', enabled: 0 }),
        row({ code: 'GBP', rate_mode: 'manual', manual_rate: null }),
      ],
      'AUD',
    )
    expect(options.map((o) => [o.code, o.rate, o.digits])).toEqual([
      ['USD', 0.66, 2],
      ['JPY', 100, 0],
    ])
  })

  it('leaves out automatic rates fetched for a different shop currency', () => {
    const options = storefrontOptions([row({ code: 'USD', rate_mode: 'auto', manual_rate: null, auto_rate: 0.7, auto_rate_base: 'NZD' })], 'AUD')
    expect(options).toEqual([])
    const fresh = storefrontOptions([row({ code: 'USD', rate_mode: 'auto', manual_rate: null, auto_rate: 0.7, auto_rate_base: 'AUD' })], 'AUD')
    expect(fresh).toEqual([{ code: 'USD', rate: 0.7, digits: 2 }])
  })
})
