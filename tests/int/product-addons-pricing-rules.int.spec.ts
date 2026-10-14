// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { beforeChangeCart } from '@/features/ecommerce/hooks/cartHooks'
import { normaliseAddOnDefs, parseAddOnInputs, priceAddOns, readAddOnChoices, addOnSummary, storeAddOnChoices, splitChoices } from '@/features/ecommerce/lib/addOns'
import { applyPricingRules, normalisePricingRules, productPageNotes, ruleIsLive, ruleNote, type PricingRule } from '@/features/ecommerce/lib/pricingRules'
import { DEFAULT_TAX_SETTINGS } from '@/features/ecommerce/lib/tax'
import { computeOrderTotals, type PricedLine } from '@/features/ecommerce/lib/totals'

/** The totals for a cart that is expected to price: fails the test with the reason otherwise. */
const priced = (r: ReturnType<typeof computeOrderTotals>): OrderTotals => {
  if (!r.ok) throw new Error((r as { error: string }).error)
  return r as OrderTotals
}
import { CheckoutError, loadPricedLines, priceCart, type ShopConfig } from '@/features/ecommerce/server/pricing'
import type { OrderTotals } from '@/features/ecommerce/lib/totals'
import { shopRulesConfigFrom } from '@/features/ecommerce/server/pricingRules'

const ADD_ON_DEFS = [
  { id: 'eng', label: 'Engraving', inputType: 'text', price: 2, priceMode: 'fixed', maxLength: 10, required: false },
  { id: 'gift', label: 'Gift wrap', inputType: 'checkbox', price: 5, required: false },
  { id: 'size', label: 'Size', inputType: 'select', choices: 'Small | Large', required: true },
  { id: 'note', label: 'Message', inputType: 'textarea', price: 0.1, priceMode: 'perCharacter', required: false },
]

const PRODUCT = {
  id: 5,
  title: 'Print',
  priceInAUD: 10,
  _status: 'published',
  productType: 'simple',
  manageStock: false,
  stockStatus: 'instock',
  category: 'prints',
  taxClass: 'standard',
  addOns: ADD_ON_DEFS,
}

function fakeEngine(extra: { globals?: Record<string, unknown>; coupons?: unknown[] } = {}) {
  const products: Record<number, unknown> = { 5: PRODUCT }
  return {
    findByID: vi.fn(async ({ id }: { id: number }) => products[id] ?? null),
    findGlobal: vi.fn(async ({ slug }: { slug: string }) => (extra.globals ?? {})[slug] ?? {}),
    find: vi.fn(async ({ collection }: { collection: string }) => ({ docs: collection === 'coupons' ? (extra.coupons ?? []) : [] })),
  }
}

const TAX = { ...DEFAULT_TAX_SETTINGS }
const address = { country: 'AU', state: 'NSW', postalCode: '2000' }
const CONFIG: ShopConfig = { tax: TAX, zones: [], rates: [], fields: [], settings: {} }

describe('add-on definitions', () => {
  it('cleans stored rows: converts dollars to cents, drops unlabelled rows and empty drop-downs', () => {
    const defs = normaliseAddOnDefs([
      { id: 'a', label: '  Engraving ', inputType: 'text', price: 2.5, priceMode: 'perCharacter', maxLength: 9999 },
      { label: '' },
      { id: 'b', label: 'Pick', inputType: 'select', choices: ' | ' },
      { id: 'c', label: 'Gift', inputType: 'checkbox', price: null },
    ])
    expect(defs.map((d) => d.id)).toEqual(['a', 'c'])
    expect(defs[0]).toMatchObject({ label: 'Engraving', priceCents: 250, priceMode: 'perCharacter', maxLength: 1000 })
    expect(defs[1]).toMatchObject({ inputType: 'checkbox', priceCents: 0, required: false })
  })

  it('reads a drop-down choice list and drops repeats and blanks', () => {
    expect(splitChoices('Small | Large |  | Small')).toEqual(['Small', 'Large'])
    expect(splitChoices(undefined)).toEqual([])
  })

  it('returns no add-ons for a product that has none, and ignores non-array data', () => {
    expect(normaliseAddOnDefs(undefined)).toEqual([])
    expect(normaliseAddOnDefs('nope')).toEqual([])
  })
})

describe('pricing add-on answers', () => {
  const defs = normaliseAddOnDefs(ADD_ON_DEFS)

  it('prices fixed charges, ticked tick boxes and drop-down answers, and skips unanswered optional add-ons', () => {
    const result = priceAddOns(defs, [
      { id: 'eng', value: 'Hi' },
      { id: 'gift', value: true },
      { id: 'size', value: 'Large' },
    ])
    expect(result).toMatchObject({ ok: true, cents: 200 + 500 })
    if (!result.ok) throw new Error('unreachable')
    expect(result.choices.map((c) => [c.label, c.value])).toEqual([
      ['Engraving', 'Hi'],
      ['Gift wrap', 'Yes'],
      ['Size', 'Large'],
    ])
  })

  it('charges per character typed for a per-character add-on', () => {
    const result = priceAddOns(defs, [
      { id: 'size', value: 'Small' },
      { id: 'note', value: 'Happy birthday' }, // 14 characters at 10 cents each
    ])
    expect(result).toMatchObject({ ok: true, cents: 140 })
  })

  it('refuses a missing required answer, a drop-down value that is not a choice, and over-long text', () => {
    const missing = priceAddOns(defs, [])
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain('Size')
    expect(priceAddOns(defs, [{ id: 'size', value: 'Medium' }])).toMatchObject({ ok: false })
    expect(priceAddOns(defs, [{ id: 'size', value: 'Small' }, { id: 'eng', value: 'Way too long for this one' }])).toMatchObject({ ok: false })
  })

  it('refuses an answer for an add-on the product does not have', () => {
    expect(priceAddOns(defs, [{ id: 'size', value: 'Small' }, { id: 'made-up', value: 'x' }])).toMatchObject({ ok: false })
  })

  it('refuses an unticked required tick box', () => {
    const required = normaliseAddOnDefs([{ id: 'ack', label: 'I agree', inputType: 'checkbox', required: true }])
    expect(priceAddOns(required, [{ id: 'ack', value: false }])).toMatchObject({ ok: false })
    expect(priceAddOns(required, [{ id: 'ack', value: true }])).toMatchObject({ ok: true, cents: 0 })
  })

  it('reads answers from an array or from the stored JSON text, and drops malformed entries', () => {
    expect(parseAddOnInputs([{ id: 'a', value: 'x' }, { id: '', value: 'y' }, 'junk', { id: 'b', value: 3 }])).toEqual([{ id: 'a', value: 'x' }])
    expect(parseAddOnInputs('[{"id":"a","value":true}]')).toEqual([{ id: 'a', value: true }])
    expect(parseAddOnInputs('{not json')).toEqual([])
  })

  it('stores the accepted answers as JSON and reads them back for display', () => {
    const stored = storeAddOnChoices([{ id: 'eng', label: 'Engraving', value: 'Hi', cents: 200 }])
    expect(readAddOnChoices(stored)).toEqual([{ id: 'eng', label: 'Engraving', value: 'Hi', cents: 200 }])
    expect(storeAddOnChoices([])).toBeNull()
    expect(readAddOnChoices('garbage')).toEqual([])
    expect(addOnSummary([{ label: 'Engraving', value: 'Hi' }, { label: 'Gift wrap', value: 'Yes' }])).toBe('Engraving: Hi; Gift wrap: Yes')
  })
})

describe('dynamic pricing rules: which rules apply', () => {
  const rule = (over: Partial<PricingRule>): PricingRule => ({
    id: 'r',
    name: 'Rule',
    enabled: true,
    discountType: 'percent',
    amount: 10,
    appliesWhen: 'quantity',
    minQuantity: 1,
    customerRole: '',
    minSubtotalCents: 0,
    category: '',
    startsAt: null,
    endsAt: null,
    priority: 10,
    exclusive: false,
    showOnProduct: false,
    ...over,
  })
  const line = (over: Record<string, unknown> = {}) => ({ key: '0', categories: ['prints'], quantity: 1, unitCents: 1000, ...over })
  const now = new Date('2026-10-28T12:00:00Z')

  it('applies a quantity rule only to lines bought in that quantity or more', () => {
    const r = applyPricingRules([rule({ minQuantity: 10 })], { lines: [line({ quantity: 9 }), line({ key: '1', quantity: 10 })], subtotalCents: 19000, now })
    expect(r.lineDiscounts).toEqual({ '1': 1000 })
    expect(r.totalCents).toBe(1000)
  })

  it('takes a percentage off the price left after earlier rules, so ordinary rules stack', () => {
    const r = applyPricingRules([rule({ id: 'a', amount: 10, priority: 1 }), rule({ id: 'b', amount: 10, priority: 2 })], { lines: [line({ unitCents: 10000 })], subtotalCents: 10000, now })
    // 10% of 10000 = 1000, then 10% of the remaining 9000 = 900.
    expect(r.lineDiscounts['0']).toBe(1900)
    expect(r.applied.map((a) => [a.id, a.cents])).toEqual([
      ['a', 1000],
      ['b', 900],
    ])
  })

  it('stops checking an item after an exclusive rule, so quantity tiers do not double up', () => {
    const tiers = [rule({ id: 'big', amount: 20, minQuantity: 25, priority: 1, exclusive: true }), rule({ id: 'small', amount: 10, minQuantity: 10, priority: 2, exclusive: true })]
    expect(applyPricingRules(tiers, { lines: [line({ quantity: 30, unitCents: 100 })], subtotalCents: 3000, now }).lineDiscounts['0']).toBe(600)
    expect(applyPricingRules(tiers, { lines: [line({ quantity: 12, unitCents: 100 })], subtotalCents: 1200, now }).lineDiscounts['0']).toBe(120)
    expect(applyPricingRules(tiers, { lines: [line({ quantity: 3, unitCents: 100 })], subtotalCents: 300, now }).lineDiscounts['0']).toBeUndefined()
  })

  it('takes a fixed amount off each item, never more than the item is worth', () => {
    const r = applyPricingRules([rule({ discountType: 'fixed', amount: 5 })], { lines: [line({ quantity: 3, unitCents: 1000 }), line({ key: '1', unitCents: 300, quantity: 1 })], subtotalCents: 3300, now })
    expect(r.lineDiscounts).toEqual({ '0': 1500, '1': 300 })
  })

  it('applies a customer-role rule only to a signed-in customer with that role', () => {
    const wholesale = rule({ appliesWhen: 'role', customerRole: 'Wholesale', amount: 15 })
    expect(applyPricingRules([wholesale], { lines: [line()], subtotalCents: 1000, customerRoles: ['wholesale'], now }).totalCents).toBe(150)
    expect(applyPricingRules([wholesale], { lines: [line()], subtotalCents: 1000, customerRoles: [], now }).totalCents).toBe(0)
  })

  it('applies a subtotal rule to every item once the cart reaches the minimum', () => {
    const r = rule({ appliesWhen: 'subtotal', minSubtotalCents: 5000, amount: 10 })
    const lines = [line({ quantity: 1, unitCents: 3000 }), line({ key: '1', unitCents: 2000 })]
    expect(applyPricingRules([r], { lines, subtotalCents: 5000, now }).totalCents).toBe(500)
    expect(applyPricingRules([r], { lines, subtotalCents: 4999, now }).totalCents).toBe(0)
  })

  it('applies a category rule only to items in that category', () => {
    const r = rule({ appliesWhen: 'category', category: 'Prints', amount: 50 })
    const lines = [line({ categories: ['prints'], unitCents: 1000 }), line({ key: '1', categories: ['frames'], unitCents: 1000 })]
    expect(applyPricingRules([r], { lines, subtotalCents: 2000, now }).lineDiscounts).toEqual({ '0': 500 })
  })

  it('respects the enabled switch and the start and end dates', () => {
    const past = rule({ endsAt: '2026-10-01T00:00:00Z' })
    const future = rule({ startsAt: '2026-11-01T00:00:00Z' })
    const off = rule({ enabled: false })
    const live = rule({ startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' })
    expect(ruleIsLive(past, now)).toBe(false)
    expect(ruleIsLive(future, now)).toBe(false)
    expect(ruleIsLive(off, now)).toBe(false)
    expect(ruleIsLive(live, now)).toBe(true)
    expect(applyPricingRules([past, future, off], { lines: [line()], subtotalCents: 1000, now }).totalCents).toBe(0)
  })

  it('never discounts gift cards, and never takes an item below zero', () => {
    const r = applyPricingRules([rule({ discountType: 'fixed', amount: 99 })], { lines: [line({ isGiftCard: true }), line({ key: '1', unitCents: 500 })], subtotalCents: 1500, now })
    expect(r.lineDiscounts).toEqual({ '1': 500 })
  })

  it('reads the stored rows: dollars to cents, bad rows dropped, equal priorities keep their entry order', () => {
    const rules = normalisePricingRules([
      { id: 'x', name: 'Second', amount: 5, priority: 2, minSubtotal: 50 },
      { id: 'y', name: 'First', amount: 5, priority: 1 },
      { id: 'z', name: 'Equal', amount: 5, priority: 2 },
      { id: 'bad', name: '', amount: 5 },
      { id: 'bad2', name: 'No amount', amount: 0 },
      { id: 'bad3', name: 'Too much', amount: 150, discountType: 'percent' },
    ])
    expect(rules.map((r) => r.id)).toEqual(['y', 'x', 'z'])
    expect(rules[1].minSubtotalCents).toBe(5000)
  })

  it('writes a plain-English note for each kind of rule and shows only the ones the shop picked', () => {
    expect(ruleNote(rule({ minQuantity: 10, amount: 10 }))).toBe('Buy 10 or more and get 10% off.')
    expect(ruleNote(rule({ discountType: 'fixed', amount: 2.5, appliesWhen: 'subtotal', minSubtotalCents: 5000 }))).toBe('Spend $50.00 or more in your cart and get $2.50 off each item.')
    const notes = productPageNotes([rule({ showOnProduct: true }), rule({ id: 'hidden' }), rule({ showOnProduct: true, appliesWhen: 'role', customerRole: 'vip' })], now)
    expect(notes).toHaveLength(1)
  })

  it('defaults the shop switches to on, with no rules, when the global is empty', () => {
    expect(shopRulesConfigFrom(null)).toEqual({ addOnsOn: true, rulesOn: true, rules: [] })
    expect(shopRulesConfigFrom({ addOnsEnabled: false, pricingRulesEnabled: false })).toMatchObject({ addOnsOn: false, rulesOn: false })
  })
})

describe('totals: dynamic pricing before coupons', () => {
  const line = (over: Partial<PricedLine> = {}): PricedLine => ({ key: '0', productId: '5', name: 'Print', unitCents: 1000, quantity: 10, taxClass: 'zero', categories: ['prints'], ...over })

  it('takes rule discounts off first, then the coupon works on what is left, and the total reflects both', () => {
    const totals = priced(computeOrderTotals({
      lines: [line()],
      address,
      zones: [],
      rates: [],
      settings: { ...TAX, enabled: false },
      coupon: { code: 'ten', type: 'percent', amount: 10, enabled: true },
      couponCode: 'ten',
      pricingRuleDiscounts: { '0': 1000 },
      pricingRules: [{ id: 'bulk', name: 'Bulk', cents: 1000 }],
    }))
    expect(totals.pricingRuleCents).toBe(1000)
    expect(totals.coupon?.discountCents).toBe(900) // 10% of the 9000 left after the rule
    expect(totals.discountCents).toBe(1900)
    expect(totals.lines[0].discountCents).toBe(1900)
    expect(totals.totalCents).toBe(10000 - 1900)
    expect(totals.pricingRules).toEqual([{ id: 'bulk', name: 'Bulk', cents: 1000 }])
  })

  it('with no rules and no coupon nothing is discounted', () => {
    const totals = priced(computeOrderTotals({ lines: [line()], address, zones: [], rates: [], settings: { ...TAX, enabled: false } }))
    expect(totals.discountCents).toBe(0)
    expect(totals.totalCents).toBe(10000)
  })
})

describe('priced cart lines with add-ons and rules (server pipeline)', () => {
  it('prices the add-on into the unit price and names the line with the answers', async () => {
    const engine = fakeEngine()
    const lines = await loadPricedLines(engine as never, [{ product: 5, quantity: 2, addOns: [{ id: 'size', value: 'Large' }, { id: 'eng', value: 'Hi' }] }])
    expect(lines[0].unitCents).toBe(1000 + 200)
    expect(lines[0].name).toBe('Print (Engraving: Hi; Size: Large)')
    expect(readAddOnChoices((lines[0] as unknown as { addOns: unknown }).addOns)).toHaveLength(2)
  })

  it('refuses a cart line that is missing a required add-on', async () => {
    const engine = fakeEngine()
    await expect(loadPricedLines(engine as never, [{ product: 5, quantity: 1, addOns: [] }])).rejects.toBeInstanceOf(CheckoutError)
  })

  it('ignores add-on answers when the shop switch is off, so the product sells as before', async () => {
    const engine = fakeEngine()
    const lines = await loadPricedLines(engine as never, [{ product: 5, quantity: 1, addOns: [] }], new Date(), false)
    expect(lines[0].unitCents).toBe(1000)
    expect(lines[0].name).toBe('Print')
  })

  it('priceCart applies a live quantity rule, then a coupon, and reports the total', async () => {
    const engine = fakeEngine({
      globals: {
        'shop-extra-settings': {
          addOnsEnabled: true,
          pricingRulesEnabled: true,
          pricingRules: [{ id: 'bulk', name: 'Bulk', appliesWhen: 'quantity', minQuantity: 10, discountType: 'percent', amount: 10 }],
        },
      },
      coupons: [{ code: 'ten', type: 'percent', amount: 10, enabled: true }],
    })
    const items = [{ product: 5, quantity: 10, addOns: [{ id: 'size', value: 'Small' }] }]
    const { totals } = await priceCart(engine as never, { items, address, couponCode: 'ten', customerRoles: [] }, CONFIG)
    // Unit: 10.00 + 0 (Small is free). Subtotal 100.00. Rule 10% = 10.00; coupon 10% of 90.00 = 9.00.
    expect(totals.subtotalCents).toBe(10000)
    expect(totals.pricingRuleCents).toBe(1000)
    expect(totals.discountCents).toBe(1900)
    expect(totals.totalCents).toBe(8100)
  })

  it('priceCart skips the rules when the shop has switched them off', async () => {
    const engine = fakeEngine({
      globals: { 'shop-extra-settings': { pricingRulesEnabled: false, pricingRules: [{ id: 'bulk', name: 'Bulk', appliesWhen: 'quantity', minQuantity: 1, amount: 50 }] } },
    })
    const { totals } = await priceCart(engine as never, { items: [{ product: 5, quantity: 1, addOns: [{ id: 'size', value: 'Large' }] }], address }, CONFIG)
    expect(totals.pricingRuleCents).toBe(0)
    expect(totals.totalCents).toBe(1000 + 0)
  })
})

describe('cart hook: add-on answers are checked and priced into the cart subtotal', () => {
  it('stores the accepted answers and adds their price to the subtotal', async () => {
    const engine = fakeEngine()
    const data: Record<string, unknown> = { items: [{ product: 5, quantity: 2, addOns: JSON.stringify([{ id: 'size', value: 'Large' }, { id: 'gift', value: true }]) }] }
    await beforeChangeCart({ data, operation: 'update', originalDoc: {}, req: { engine } } as never)
    expect(data.subtotal).toBe((10 + 5) * 2)
    const stored = (data.items as { addOns: string }[])[0].addOns
    expect(readAddOnChoices(stored).map((c) => c.label)).toEqual(['Gift wrap', 'Size'])
  })

  it('refuses a line with a missing required answer', async () => {
    const engine = fakeEngine()
    const data: Record<string, unknown> = { items: [{ product: 5, quantity: 1 }] }
    await expect(beforeChangeCart({ data, operation: 'update', originalDoc: {}, req: { engine } } as never)).rejects.toThrow()
  })
})
