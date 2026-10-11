// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { applyCoupon, type CouponDoc } from '@/features/ecommerce/lib/coupons'
import { allocate, percentOf, toCents } from '@/features/ecommerce/lib/money'
import { renderInvoiceHtml, renderPackingSlipHtml, escapeHtml } from '@/features/ecommerce/lib/invoice'
import { canTransition, ORDER_TRANSITIONS, ORDER_STATUSES, refundableCents, validateRefund } from '@/features/ecommerce/lib/orderStatus'
import { quoteShipping, type ShippingZone } from '@/features/ecommerce/lib/shipping'
import { calcTax, DEFAULT_TAX_SETTINGS } from '@/features/ecommerce/lib/tax'
import { computeOrderTotals, type PricedLine } from '@/features/ecommerce/lib/totals'
import { dueReminder, signCartToken, verifyCartToken } from '@/features/ecommerce/lib/abandonedCart'
import { resolveCheckoutFields, validateCheckoutValues } from '@/features/ecommerce/lib/checkoutFields'

describe('money', () => {
  it('converts and rounds in integer cents', () => {
    expect(toCents(29.99)).toBe(2999)
    expect(toCents(1.005)).toBe(101)
    expect(percentOf(1999, 10)).toBe(200)
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('calcTax', () => {
  it('extracts GST from inclusive prices (10%)', () => {
    const r = calcTax({ lines: [{ key: 'a', amountCents: 1100, taxClass: 'standard' }], rates: [], settings: DEFAULT_TAX_SETTINGS, address: { country: 'AU' } })
    expect(r.taxCents).toBe(100)
    expect(r.addedCents).toBe(0)
    expect(r.taxLines).toEqual([{ name: 'GST', ratePct: 10, taxCents: 100 }])
  })
  it('rounds half-up per line: $9.99 inc GST = 91c', () => {
    const r = calcTax({ lines: [{ key: 'a', amountCents: 999, taxClass: 'standard' }], rates: [], settings: DEFAULT_TAX_SETTINGS, address: { country: 'AU' } })
    expect(r.taxCents).toBe(91)
    expect(r.lines[0].netCents).toBe(908)
  })
  it('adds tax on top when prices exclude tax', () => {
    const r = calcTax({ lines: [{ key: 'a', amountCents: 1000, taxClass: 'standard' }], shippingCents: 500, rates: [], settings: { ...DEFAULT_TAX_SETTINGS, pricesIncludeTax: false }, address: { country: 'AU' } })
    expect(r.taxCents).toBe(150)
    expect(r.addedCents).toBe(150)
  })
  it('zero class and foreign addresses are untaxed; configured rates win', () => {
    expect(calcTax({ lines: [{ key: 'a', amountCents: 1100, taxClass: 'zero' }], rates: [], settings: DEFAULT_TAX_SETTINGS, address: { country: 'AU' } }).taxCents).toBe(0)
    expect(calcTax({ lines: [{ key: 'a', amountCents: 1100, taxClass: 'standard' }], rates: [], settings: DEFAULT_TAX_SETTINGS, address: { country: 'NZ' } }).taxCents).toBe(0)
    const r = calcTax({ lines: [{ key: 'a', amountCents: 1000, taxClass: 'standard' }], rates: [{ name: 'VAT', taxClass: 'standard', country: 'GB', ratePct: 20 }], settings: { ...DEFAULT_TAX_SETTINGS, pricesIncludeTax: false }, address: { country: 'GB' } })
    expect(r.taxCents).toBe(200)
  })
})

const zones: ShippingZone[] = [
  {
    id: 1,
    name: 'Sydney',
    order: 0,
    regions: [{ type: 'postcode', country: 'AU', value: '2000-2234, 26*' }],
    methods: [
      { type: 'flat', title: 'Local', cost: 5, classSurcharges: [{ shippingClass: '7', cost: 2 }] },
      { type: 'local_pickup', title: 'Pickup', cost: 0 },
    ],
  },
  {
    id: 2,
    name: 'Australia',
    order: 1,
    regions: [{ type: 'country', country: 'AU' }],
    methods: [
      { type: 'free_over_amount', title: 'Free', freeOver: 100 },
      { type: 'table_rate', title: 'Weight', tableBasis: 'weight', tableRates: [{ min: 0, max: 1, cost: 8 }, { min: 1, max: 5, cost: 15 }] },
    ],
  },
  { id: 3, name: 'World', order: 9, regions: [], methods: [{ type: 'flat', title: 'Intl', cost: 30 }] },
]

describe('quoteShipping', () => {
  const item = (o: Partial<{ weightGrams: number; shippingClass: string; quantity: number }> = {}) => ({ productId: 1, quantity: 1, weightGrams: 500, ...o })
  it('matches postcode ranges and wildcards first, with class surcharges', () => {
    const q = quoteShipping({ subtotalCents: 5000, items: [item({ shippingClass: '7', quantity: 2 })] }, { country: 'AU', postalCode: '2010' }, zones)
    expect(q.map((o) => [o.title, o.costCents])).toEqual([['Local', 900], ['Pickup', 0]])
    expect(quoteShipping({ subtotalCents: 5000, items: [item()] }, { country: 'AU', postalCode: '2600' }, zones)[0].title).toBe('Local')
  })
  it('falls through to a country zone: table rate by weight, free over threshold', () => {
    const q = quoteShipping({ subtotalCents: 5000, items: [item({ quantity: 4 })] }, { country: 'AU', postalCode: '3000' }, zones)
    expect(q.map((o) => [o.title, o.costCents])).toEqual([['Weight', 1500]])
    const free = quoteShipping({ subtotalCents: 10000, items: [item()] }, { country: 'AU', postalCode: '3000' }, zones)
    expect(free.find((o) => o.title === 'Free')?.costCents).toBe(0)
  })
  it('catch-all zone, no ship for digital, free shipping coupon', () => {
    expect(quoteShipping({ subtotalCents: 1, items: [item()] }, { country: 'NZ' }, zones)[0].costCents).toBe(3000)
    expect(quoteShipping({ subtotalCents: 1, items: [{ ...item(), requiresShipping: false }] }, { country: 'AU' }, zones)).toEqual([])
    expect(quoteShipping({ subtotalCents: 1, freeShipping: true, items: [item()] }, { country: 'NZ' }, zones)[0].costCents).toBe(0)
  })
})

describe('applyCoupon', () => {
  const lines = [
    { key: 'a', productId: '1', categories: ['apparel'], quantity: 2, unitCents: 1000 },
    { key: 'b', productId: '2', categories: ['digital'], quantity: 1, unitCents: 3000, onSale: true },
  ]
  const base: CouponDoc = { code: 'save10', type: 'percent', amount: 10 }
  it('percent, fixed cart, fixed product', () => {
    expect(applyCoupon(base, { lines })).toMatchObject({ ok: true, discountCents: 500 })
    expect(applyCoupon({ ...base, type: 'fixed_cart', amount: 7 }, { lines })).toMatchObject({ ok: true, discountCents: 700 })
    expect(applyCoupon({ ...base, type: 'fixed_product', amount: 3, includeProducts: '1' }, { lines })).toMatchObject({ ok: true, discountCents: 600 })
    expect(applyCoupon({ ...base, type: 'fixed_cart', amount: 999 }, { lines })).toMatchObject({ ok: true, discountCents: 5000 })
  })
  it('clear errors', () => {
    const err = (c: CouponDoc | null, ctx = {}) => {
      const r = applyCoupon(c, { lines, ...ctx })
      return r.ok ? 'ok' : (r as { error: string }).error
    }
    expect(err(null)).toMatch(/not found/)
    expect(err({ ...base, expiresAt: '2020-01-01T00:00:00Z' })).toMatch(/expired/)
    expect(err({ ...base, minSpend: 100 })).toMatch(/minimum spend/)
    expect(err({ ...base, maxSpend: 10 })).toMatch(/maximum spend/)
    expect(err({ ...base, usageLimit: 3, usageCount: 3 })).toMatch(/usage limit/)
    expect(err({ ...base, usageLimitPerUser: 1 }, { email: 'a@b.co', usesByThisCustomer: 1 })).toMatch(/already used/)
    expect(err({ ...base, usageLimitPerUser: 1 })).toMatch(/email/)
    expect(err({ ...base, individualUse: true }, { alreadyApplied: [{ code: 'x', type: 'percent' }] })).toMatch(/other coupons/)
    expect(err({ ...base, enabled: false })).toMatch(/not active/)
    expect(err({ ...base, excludeCategories: 'apparel,digital' })).toMatch(/does not apply/)
  })
  it('excludes sale items and categories', () => {
    expect(applyCoupon({ ...base, excludeSaleItems: true }, { lines })).toMatchObject({ discountCents: 200 })
    expect(applyCoupon({ ...base, includeCategories: 'digital' }, { lines })).toMatchObject({ discountCents: 300 })
  })
  it('free shipping flags and discounts nothing', () => {
    expect(applyCoupon({ ...base, type: 'free_shipping' }, { lines })).toMatchObject({ ok: true, freeShipping: true, discountCents: 0 })
  })
})

describe('computeOrderTotals', () => {
  const lines: PricedLine[] = [{ key: 'a', productId: '1', name: 'Tee', unitCents: 2750, quantity: 2, taxClass: 'standard', categories: [], weightGrams: 300 }]
  it('never trusts a client shipping id and totals inclusive GST', () => {
    const args = { lines, address: { country: 'AU', postalCode: '3000' }, zones, rates: [] as never[], settings: DEFAULT_TAX_SETTINGS }
    const bad = computeOrderTotals({ ...args, shippingOptionId: '99:9', requireShipping: true })
    expect(bad).toMatchObject({ ok: false })
    const good = computeOrderTotals({ ...args, shippingOptionId: '2:1', requireShipping: true, couponCode: 'x', coupon: { code: 'x', type: 'percent', amount: 10 } })
    if (!good.ok) throw new Error('x')
    if (good.ok !== true) return
    expect(good.subtotalCents).toBe(5500)
    expect(good.discountCents).toBe(550)
    expect(good.shippingCents).toBe(800)
    expect(good.totalCents).toBe(5500 - 550 + 800)
    expect(good.taxCents).toBe(Math.round(((5500 - 550) * 10) / 110) + Math.round((800 * 10) / 110))
  })
})

describe('order transitions and refunds', () => {
  it('every status has a map entry and refunded is terminal', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toBeDefined()
    expect(canTransition('pending', 'processing')).toBe(true)
    expect(canTransition('processing', 'completed')).toBe(true)
    expect(canTransition('completed', 'pending')).toBe(false)
    expect(canTransition('refunded', 'processing')).toBe(false)
    expect(canTransition(null, 'pending')).toBe(true)
    expect(canTransition('processing', 'bogus')).toBe(false)
  })
  it('refund limits never exceed paid', () => {
    const order = { amount: 10000, refundedTotal: 2500, status: 'processing' }
    expect(refundableCents(order)).toBe(7500)
    expect(validateRefund(order, 7501)).toMatchObject({ ok: false })
    expect(validateRefund(order, 7500)).toEqual({ ok: true, fullRefund: true })
    expect(validateRefund(order, 100)).toEqual({ ok: true, fullRefund: false })
    expect(validateRefund(order, 0)).toMatchObject({ ok: false })
    expect(validateRefund(order, 1.5)).toMatchObject({ ok: false })
    expect(validateRefund({ ...order, status: 'pending' }, 100)).toMatchObject({ ok: false })
  })
})

describe('invoice', () => {
  const order = {
    id: 12,
    status: 'processing',
    amount: 1100,
    subtotal: 1100,
    taxTotal: 100,
    pricesIncludeTax: true,
    taxLines: [{ name: 'GST', ratePct: 10, taxCents: 100 }],
    customerNote: '<script>alert(1)</script>',
    customerEmail: 'a"b@x.co',
    shippingAddress: { firstName: '<img src=x onerror=alert(2)>', addressLine1: '1 St' },
    checkoutFields: { abn: { label: 'ABN<b>', value: '"><svg onload=1>' } },
    lineItems: [{ name: '<b>Tee</b>', quantity: 1, unitCents: 1100, lineCents: 1100 }],
  }
  it('is a tax invoice with ABN and escapes everything', () => {
    const html = renderInvoiceHtml(order, { name: 'Shop <x>', abn: '12 345 678 901' })
    expect(html).toContain('Tax invoice')
    expect(html).toContain('ABN 12 345 678 901')
    expect(html).not.toMatch(/<script>alert|<img src=x|<svg onload|<b>Tee/)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('@media print')
    expect(renderPackingSlipHtml(order, { name: 'S' })).not.toContain('<img src=x')
  })
  it('is a plain invoice without GST', () => {
    const html = renderInvoiceHtml({ ...order, taxTotal: 0, taxLines: [] }, { name: 'S', abn: '1' })
    expect(html).toContain('<h1>Invoice</h1>')
  })
  it('escapeHtml', () => expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;'))
})

describe('abandoned cart', () => {
  const settings = { enabled: true, firstDelayHours: 1, secondDelayHours: 24, maxReminders: 2 }
  const now = new Date('2026-10-12T12:00:00Z')
  const cart = { email: 'a@b.co', updatedAt: '2026-10-12T09:00:00Z', itemCount: 1 }
  it('eligibility', () => {
    expect(dueReminder(cart, settings, now)).toBe(1)
    expect(dueReminder(cart, { ...settings, enabled: false }, now)).toBeNull()
    expect(dueReminder({ ...cart, updatedAt: '2026-10-12T11:30:00Z' }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, remindersSent: 1, lastReminderAt: '2026-10-12T10:00:00Z' }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, updatedAt: '2026-10-10T09:00:00Z', remindersSent: 1, lastReminderAt: '2026-10-11T09:00:00Z' }, settings, now)).toBe(2)
    expect(dueReminder({ ...cart, remindersSent: 2 }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, remindersSent: 1, lastReminderAt: '2026-10-12T09:30:00Z' }, { ...settings, maxReminders: 1 }, now)).toBeNull()
    expect(dueReminder({ ...cart, purchasedAt: '2026-10-12T10:00:00Z' }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, recoveredAt: '2026-10-12T10:00:00Z' }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, unsubscribed: true }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, email: null }, settings, now)).toBeNull()
    expect(dueReminder({ ...cart, updatedAt: '2026-09-01T00:00:00Z' }, settings, now)).toBeNull()
  })
  it('signed tokens are purpose-bound and tamper-proof', async () => {
    const t = await signCartToken('secret', 5, 'recover')
    expect(await verifyCartToken('secret', t, 'recover')).toEqual({ ok: true, cartId: 5 })
    expect(await verifyCartToken('secret', t, 'unsub')).toEqual({ ok: false })
    expect(await verifyCartToken('other', t, 'recover')).toEqual({ ok: false })
    expect(await verifyCartToken('secret', t.replace(/^5/, '6'), 'recover')).toEqual({ ok: false })
    const expired = await signCartToken('secret', 5, 'recover', Date.now() - 1000)
    expect(await verifyCartToken('secret', expired, 'recover')).toEqual({ ok: false })
  })
})

describe('checkout fields', () => {
  it('resolves, orders, relabels and validates', () => {
    const fields = resolveCheckoutFields([
      { key: 'abn', enabled: true, required: true, label: 'Business ABN' },
      { key: 'custom_gate', label: 'Gate code', enabled: true },
    ])
    expect(fields.map((f) => f.key).slice(0, 2)).toEqual(['abn', 'custom_gate'])
    expect(fields.find((f) => f.key === 'phone')?.enabled).toBe(false)
    expect(validateCheckoutValues(fields, {})).toMatchObject({ ok: false })
    expect(validateCheckoutValues(fields, { abn: '123' })).toMatchObject({ ok: false })
    const ok = validateCheckoutValues(fields, { abn: '12 345 678 901', custom_gate: ' 1234 ', phone: '0400', evil: 'x' })
    expect(ok).toEqual({ ok: true, values: { abn: { label: 'Business ABN', value: '12 345 678 901' }, custom_gate: { label: 'Gate code', value: '1234' } } })
  })
})
