// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { validateTrackingEvent } from '@/features/tracking/events'
import { parseMoney, resolveTagValue } from '@/features/tracking/valueResolve'
import { gatherValueContext } from '@/features/tracking/valueSources'

describe('parseMoney', () => {
  it('reads plain and symbol prices', () => {
    expect(parseMoney('$12.50')).toEqual({ value: 12.5, currency: null })
    expect(parseMoney('  $1,234.50 ')).toEqual({ value: 1234.5, currency: null })
    expect(parseMoney('49')).toEqual({ value: 49, currency: null })
  })

  it('reads European grouping and decimal commas', () => {
    expect(parseMoney('1.234,50 €')).toEqual({ value: 1234.5, currency: null })
    expect(parseMoney('12,50')).toEqual({ value: 12.5, currency: null })
    expect(parseMoney('1,234')).toEqual({ value: 1234, currency: null })
    expect(parseMoney('1.234')).toEqual({ value: 1234, currency: null })
  })

  it('takes a currency code only when it is a known code', () => {
    expect(parseMoney('AUD 12.00')).toEqual({ value: 12, currency: 'AUD' })
    expect(parseMoney('ADD TO CART 12.00')).toEqual({ value: 12, currency: null })
  })

  it('returns null for text with no number, negatives and empty input', () => {
    expect(parseMoney('Add to cart')).toBeNull()
    expect(parseMoney('-5.00')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney(null)).toBeNull()
  })
})

describe('resolveTagValue', () => {
  const base: { value: number | null; currency: string | null } = { value: null, currency: null }
  it('sends nothing for the none source', () => {
    expect(resolveTagValue({ ...base, valueSource: 'none' }, { siteCurrency: 'AUD' })).toEqual({ value: null, currency: null, source: 'none' })
  })

  it('uses the fixed amount and its currency, falling back to the site currency', () => {
    expect(resolveTagValue({ ...base, value: 20, valueSource: 'fixed', currency: 'USD' }, {})).toMatchObject({ value: 20, currency: 'USD' })
    expect(resolveTagValue({ ...base, value: 20, valueSource: 'fixed' }, { siteCurrency: 'AUD' })).toMatchObject({ value: 20, currency: 'AUD' })
  })

  it('takes the cart total with the cart currency', () => {
    expect(resolveTagValue({ ...base, valueSource: 'cartTotal' }, { cart: { amount: 84.1, currency: 'NZD' }, siteCurrency: 'AUD' })).toMatchObject({ value: 84.1, currency: 'NZD' })
    expect(resolveTagValue({ ...base, valueSource: 'cartTotal' }, { cart: null, siteCurrency: 'AUD' })).toMatchObject({ value: null, currency: null })
  })

  it('reads the product price and the order total from their text', () => {
    expect(resolveTagValue({ ...base, valueSource: 'productPrice' }, { productPriceText: 'AUD 39.90', siteCurrency: 'AUD' })).toMatchObject({ value: 39.9, currency: 'AUD' })
    expect(resolveTagValue({ ...base, valueSource: 'orderTotal' }, { orderTotalText: 'Total $1,080.00', siteCurrency: 'USD' })).toMatchObject({ value: 1080, currency: 'USD' })
  })

  it('reads the quantity only when it is a positive whole number', () => {
    expect(resolveTagValue({ ...base, valueSource: 'quantity' }, { quantity: 3 })).toMatchObject({ value: 3 })
    expect(resolveTagValue({ ...base, valueSource: 'quantity' }, { quantity: 0 })).toMatchObject({ value: null })
    expect(resolveTagValue({ ...base, valueSource: 'quantity' }, { quantity: 1.5 })).toMatchObject({ value: null })
  })

  it('reads an attribute or the text of the element, and a data layer variable', () => {
    expect(resolveTagValue({ ...base, valueSource: 'elementAttr', valueRef: 'data-price' }, { elementAttr: (n) => (n === 'data-price' ? '19.99' : null), siteCurrency: 'GBP' })).toMatchObject({ value: 19.99, currency: 'GBP' })
    expect(resolveTagValue({ ...base, valueSource: 'elementText' }, { elementText: 'Total: 7,50' })).toMatchObject({ value: 7.5 })
    expect(resolveTagValue({ ...base, valueSource: 'dataLayer', valueRef: 'cartValue' }, { dataLayer: () => 42 })).toMatchObject({ value: 42 })
    expect(resolveTagValue({ ...base, valueSource: 'dataLayer', valueRef: 'cartValue' }, { dataLayer: () => '42.00 USD' })).toMatchObject({ value: 42, currency: 'USD' })
  })

  it('a value that cannot be read is sent as none, never guessed', () => {
    expect(resolveTagValue({ ...base, valueSource: 'elementText' }, { elementText: 'Buy' })).toMatchObject({ value: null, currency: null })
  })

  it('a currency the page printed wins over the event and site currencies', () => {
    expect(resolveTagValue({ ...base, valueSource: 'elementText', currency: 'USD' }, { elementText: 'NZD 10', siteCurrency: 'AUD' })).toMatchObject({ currency: 'NZD' })
  })
})

describe('gatherValueContext reads the page', () => {
  it('reads the clicked element text, its attribute, and the page price', async () => {
    document.body.innerHTML = '<button id="buy" data-price="15.00">Buy</button><span itemprop="price">$22.00</span>'
    const win = window as unknown as Window
    const clicked = document.getElementById('buy')
    const ctx = await gatherValueContext(win, { valueSource: 'elementAttr', valueRef: 'data-price', valueSelector: null }, clicked, 'AUD')
    expect(ctx.elementAttr?.('data-price')).toBe('15.00')
    expect(ctx.productPriceText).toBe('$22.00')
    expect(resolveTagValue({ valueSource: 'elementAttr', valueRef: 'data-price', value: null, currency: null }, ctx)).toMatchObject({ value: 15, currency: 'AUD' })
  })

  it('reads a value selector in preference to the clicked element', async () => {
    document.body.innerHTML = '<button id="buy">Buy</button><p class="total">Total AUD 30.00</p>'
    const ctx = await gatherValueContext(window as unknown as Window, { valueSource: 'elementText', valueSelector: 'p.total', valueRef: null }, document.getElementById('buy'), null)
    expect(ctx.elementText).toBe('Total AUD 30.00')
  })
})

describe('value rules in the validator', () => {
  const base = { name: 'Buy', platformEvent: 'Purchase' as const, triggerType: 'click' as const, selector: '#buy' }
  it('needs a fixed amount, an attribute name and a data layer name when those sources are chosen', () => {
    expect(validateTrackingEvent({ ...base, valueSource: 'fixed' }).join(' ')).toMatch(/fixed value/)
    expect(validateTrackingEvent({ ...base, valueSource: 'elementAttr' }).join(' ')).toMatch(/attribute/)
    expect(validateTrackingEvent({ ...base, valueSource: 'dataLayer', valueRef: 'bad name' }).join(' ')).toMatch(/data layer/)
    expect(validateTrackingEvent({ ...base, valueSource: 'dataLayer', valueRef: 'cartValue' })).toEqual([])
  })

  it('refuses an unknown source', () => {
    expect(validateTrackingEvent({ ...base, valueSource: 'magic' as never }).join(' ')).toMatch(/value source/)
  })
})
