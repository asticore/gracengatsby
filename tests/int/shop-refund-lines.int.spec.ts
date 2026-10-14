// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { linePaidCents, parseLineRequests, refundedByLine, refundedShippingCents, validateLineRefund } from '@/features/ecommerce/lib/refundLines'
import { buildLineViews, selectedRefund, toCents, toUnits, type RefundInfo } from '@/features/ecommerce/admin/refundView'

const lines = [
  { name: 'Linen shirt', quantity: 2, lineCents: 12000, discountCents: 1000, taxCents: 1000 },
  { name: 'Canvas tote', quantity: 1, lineCents: 3500, discountCents: 0, taxCents: 318 },
]
const order = { lineItems: lines, pricesIncludeTax: true, shippingTotal: 900 }

describe('linePaidCents', () => {
  it('is the line total less discount, with tax only added when prices exclude it', () => {
    expect(linePaidCents(lines[0], true)).toBe(11000)
    expect(linePaidCents(lines[0], false)).toBe(12000)
    expect(linePaidCents({ lineCents: 1000, discountCents: 5000 }, true)).toBe(0)
  })
})

describe('parseLineRequests', () => {
  it('drops empty entries and adds up repeats of one line', () => {
    const r = parseLineRequests([
      { lineId: 1, quantity: 0, amount: 0 },
      { lineId: 0, quantity: 1, amount: 500 },
      { lineId: 0, quantity: 1, amount: 250, restock: true },
    ], 2)
    expect(r).toEqual({ ok: true, lines: [{ lineId: 0, quantity: 2, amount: 750, restock: true }] })
  })

  it('refuses lines that are not on the order, and amounts that are not whole cents', () => {
    expect(parseLineRequests([{ lineId: 2, amount: 100 }], 2)).toEqual({ ok: false, error: 'That line is not on this order.' })
    expect(parseLineRequests([{ lineId: -1, amount: 100 }], 2).ok).toBe(false)
    expect(parseLineRequests([{ lineId: 0, amount: 1.5 }], 2).ok).toBe(false)
    expect(parseLineRequests([{ lineId: 0, quantity: -1 }], 2).ok).toBe(false)
    expect(parseLineRequests('nope', 2).ok).toBe(false)
  })
})

describe('validateLineRefund', () => {
  it('works out the total from the lines and shipping, never from the client', () => {
    const r = validateLineRefund({ order, priorRefunds: [], lines: [{ lineId: 0, quantity: 1, amount: 5000, restock: true }], shippingCents: 900 })
    expect(r).toMatchObject({ ok: true, amount: 5900, shippingCents: 900, restockItems: [{ index: 0, quantity: 1 }] })
  })

  it('caps each line at what it paid, less what was already refunded on it', () => {
    const prior = [{ lines: [{ lineId: 0, quantity: 1, amount: 6000 }] }]
    expect(validateLineRefund({ order, priorRefunds: prior, lines: [{ lineId: 0, amount: 5001 }], shippingCents: 0 })).toEqual({ ok: false, error: 'Linen shirt: only $50.00 is left to refund on this line.' })
    expect(validateLineRefund({ order, priorRefunds: prior, lines: [{ lineId: 0, amount: 5000 }], shippingCents: 0 }).ok).toBe(true)
  })

  it('caps units at what is left to refund on the line', () => {
    const prior = [{ lines: [{ lineId: 0, quantity: 1, amount: 0 }] }]
    expect(validateLineRefund({ order, priorRefunds: prior, lines: [{ lineId: 0, quantity: 2 }], shippingCents: 0 })).toEqual({ ok: false, error: 'Linen shirt: only 1 unit(s) are left to refund.' })
  })

  it('caps shipping at what the customer paid for shipping, less what was refunded', () => {
    const prior = [{ shippingAmount: 500 }]
    expect(validateLineRefund({ order, priorRefunds: prior, lines: [], shippingCents: 401 })).toEqual({ ok: false, error: 'Only $4.00 of shipping is left to refund.' })
    expect(validateLineRefund({ order, priorRefunds: prior, lines: [], shippingCents: 400 })).toMatchObject({ ok: true, amount: 400 })
  })

  it('refuses an empty refund and a non-whole shipping amount', () => {
    expect(validateLineRefund({ order, priorRefunds: [], lines: [], shippingCents: 0 })).toEqual({ ok: false, error: 'Choose at least one line or the shipping to refund.' })
    expect(validateLineRefund({ order, priorRefunds: [], lines: [], shippingCents: 2.5 }).ok).toBe(false)
  })

  it('only marks restock for ticked lines with units', () => {
    const r = validateLineRefund({
      order,
      priorRefunds: [],
      lines: [{ lineId: 0, quantity: 1, amount: 100, restock: false }, { lineId: 1, quantity: 1, amount: 100, restock: true }],
      shippingCents: 0,
    })
    expect(r.ok && r.restockItems).toEqual([{ index: 1, quantity: 1 }])
  })
})

describe('refunded totals', () => {
  it('adds up what each line and shipping already got back', () => {
    const refunds = [
      { lines: [{ lineId: 0, quantity: 1, amount: 500 }], shippingAmount: 200 },
      { lines: [{ lineId: 0, quantity: 2, amount: 700 }, { lineId: 1, quantity: 1, amount: 100 }], shippingAmount: null },
      { amount: 999 },
    ]
    const done = refundedByLine(refunds)
    expect(done.get(0)).toEqual({ amount: 1200, quantity: 3 })
    expect(done.get(1)).toEqual({ amount: 100, quantity: 1 })
    expect(refundedShippingCents(refunds)).toBe(200)
  })
})

describe('refund panel view', () => {
  const info: RefundInfo = {
    refunds: [],
    amount: 16400,
    refundedTotal: 0,
    lineItems: lines,
    refundedByLine: { '0': { amount: 1000, quantity: 1 } },
    shippingTotal: 900,
    shippingRefunded: 0,
    pricesIncludeTax: true,
    canCardRefund: true,
  }

  it('shows what is left on each line after earlier refunds', () => {
    const views = buildLineViews(info, {})
    expect(views[0]).toMatchObject({ paid: 11000, doneAmount: 1000, doneUnits: 1, unitsLeft: 1, amountLeft: 10000 })
    expect(views[1]).toMatchObject({ paid: 3500, doneAmount: 0, unitsLeft: 1 })
  })

  it('sends only what is picked, clamped to what is left, with the total the admin sees', () => {
    const views = buildLineViews(info, { 0: { units: '5', amount: '200.00', restock: true }, 1: { units: '', amount: '', restock: false } })
    const picked = selectedRefund(views, '3.00')
    expect(picked).toEqual({ lines: [{ lineId: 0, quantity: 1, amount: 10000, restock: true }], shippingCents: 300, total: 10300 })
  })

  it('reads typed dollars and units safely', () => {
    expect(toCents('12.34')).toBe(1234)
    expect(toCents('abc')).toBe(0)
    expect(toCents('-4')).toBe(0)
    expect(toUnits('2.9')).toBe(2)
    expect(toUnits('')).toBe(0)
  })
})
