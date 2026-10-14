// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runChanges } = vi.hoisted(() => ({ runChanges: vi.fn(async () => 1) }))
vi.mock('@/features/ecommerce/server/db', () => ({
  rawD1: vi.fn(async () => ({})),
  runChanges,
  SQL: { reserveRefund: 'RESERVE', releaseRefund: 'RELEASE' },
}))
vi.mock('@/features/ecommerce/server/orders', () => ({
  addOrderNote: vi.fn(async () => undefined),
  restockedSoFar: vi.fn(async () => new Map<number, number>()),
  restockOrder: vi.fn(async () => undefined),
}))
vi.mock('@/features/ecommerce/server/emails', () => ({ sendOrderEmail: vi.fn(async () => undefined) }))
vi.mock('@/features/ecommerce/server/storedValue', () => ({ refundToStoreCredit: vi.fn(async () => undefined) }))

import { runRefundBeforeChange } from '@/features/ecommerce/server/refunds'

const order = {
  id: 7,
  status: 'processing',
  amount: 16400,
  refundedTotal: 0,
  shippingTotal: 900,
  pricesIncludeTax: true,
  stockAdjusted: true,
  paymentIntentId: null as string | null,
  lineItems: [
    { name: 'Linen shirt', quantity: 2, lineCents: 12000, discountCents: 1000, taxCents: 1000 },
    { name: 'Canvas tote', quantity: 1, lineCents: 3500, discountCents: 0, taxCents: 318 },
  ],
}

function req(orderDoc: Record<string, unknown> = order) {
  return {
    engine: {
      findByID: vi.fn(async () => orderDoc),
      update: vi.fn(async () => ({})),
      find: vi.fn(async () => ({ docs: [] as Record<string, unknown>[] })),
      findGlobal: vi.fn(async () => ({})),
    },
    user: { id: 3, email: 'staff@example.com' },
  }
}

describe('runRefundBeforeChange with line-item refunds', () => {
  beforeEach(() => runChanges.mockClear())

  it('works out the amount from the lines and shipping, and restocks only ticked lines', async () => {
    const data: Record<string, unknown> = {
      order: 7,
      method: 'manual',
      amount: 1,
      lines: [
        { lineId: 0, quantity: 1, amount: 5000, restock: true },
        { lineId: 1, quantity: 0, amount: 1000, restock: false },
      ],
      shippingAmount: 900,
    }
    const out = await runRefundBeforeChange({ data, operation: 'create', req: req() as never })
    expect(out.amount).toBe(6900)
    expect(out.shippingAmount).toBe(900)
    expect(out.restock).toBe(true)
    expect(out.items).toEqual([{ index: 0, quantity: 1 }])
    expect(out.status).toBe('completed')
    expect(runChanges).toHaveBeenCalledWith({}, 'RESERVE', 7, 6900)
  })

  it('refuses a line over its paid amount before anything is reserved', async () => {
    const data: Record<string, unknown> = { order: 7, method: 'manual', lines: [{ lineId: 1, quantity: 0, amount: 3501 }] }
    await expect(runRefundBeforeChange({ data, operation: 'create', req: req() as never })).rejects.toThrow('Canvas tote: only $35.00 is left to refund on this line.')
    expect(runChanges).not.toHaveBeenCalled()
  })

  it('leaves a restock off when no line is ticked', async () => {
    const data: Record<string, unknown> = { order: 7, method: 'manual', restock: true, lines: [{ lineId: 0, quantity: 1, amount: 100, restock: false }] }
    const out = await runRefundBeforeChange({ data, operation: 'create', req: req() as never })
    expect(out.restock).toBe(false)
    expect(out.items).toEqual([])
  })

  it('keeps the plain amount refund working when no lines are sent', async () => {
    const data: Record<string, unknown> = { order: 7, method: 'manual', amount: 1234 }
    const out = await runRefundBeforeChange({ data, operation: 'create', req: req() as never })
    expect(out.amount).toBe(1234)
    expect(out.lines).toBeUndefined()
  })
})
