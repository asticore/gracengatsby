// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { currencyFromShopSettings, loadShopCurrency, normaliseCurrency } from '@/features/ecommerce/lib/shopCurrency'
import { shopCurrency } from '@/features/ecommerce/server/pricing'

describe('shop currency', () => {
  it('reads Shop settings > General (general.currency) and upper-cases it', () => {
    expect(currencyFromShopSettings({ general: { currency: 'usd' } })).toBe('USD')
    expect(currencyFromShopSettings({ general: { currency: 'NZD' } })).toBe('NZD')
  })

  it('falls back to AUD when nothing usable is saved', () => {
    expect(currencyFromShopSettings({})).toBe('AUD')
    expect(currencyFromShopSettings(null)).toBe('AUD')
    expect(currencyFromShopSettings({ general: { currency: 'DOLLARS' } })).toBe('AUD')
    expect(normaliseCurrency(42)).toBe('AUD')
  })

  it('pricing uses the same setting, so a USD shop charges in USD', () => {
    expect(shopCurrency({ settings: { general: { currency: 'USD' } } })).toBe('USD')
    expect(shopCurrency({ settings: {} })).toBe('AUD')
  })

  it('loadShopCurrency reads the shop-settings global and tolerates a failing engine', async () => {
    const engine = { findGlobal: async (args: unknown) => (args as { slug: string }).slug === 'shop-settings' ? { general: { currency: 'GBP' } } : {} }
    expect(await loadShopCurrency(engine)).toBe('GBP')
    expect(await loadShopCurrency({ findGlobal: async () => { throw new Error('down') } })).toBe('AUD')
  })
})
