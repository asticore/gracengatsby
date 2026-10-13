// @vitest-environment node
// Order and invoice numbering against a real (local) D1: atomic allocation under concurrency,
// prefix and padding, paid-order invoice numbers, and no reassignment. Also the orders list
// filter mapping and the customer-name search SQL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { formatInvoiceNumber, normaliseInvoiceSettings } from '@/features/ecommerce/lib/invoiceSettings'
import { addDays, applyOrderPicks, EMPTY_ORDER_PICKS, readOrderPicks } from '@/features/ecommerce/lib/orderFilters'
import { ensureInvoiceNumber, formatOrderNumber, nextOrderNumber, readNumberingSettings, sanitiseOrderPrefix, takeNumber } from '@/features/ecommerce/numbering'

const hoisted = vi.hoisted(() => ({ d1: null as unknown as D1Database }))
vi.mock('@/features/ecommerce/server/db', () => ({ rawD1: async () => hoisted.d1 }))

// Imported after the mock so the search helper uses the test database.
const { orderNameSearchBranches } = await import('@/features/ecommerce/server/orderSearch')

describe('pure number formatting', () => {
  it('joins prefix and zero-padded number for orders (default padding 4)', () => {
    expect(formatOrderNumber('GG-', 1001)).toBe('GG-1001')
    expect(formatOrderNumber('', 42)).toBe('0042')
    expect(formatOrderNumber('GG-', 12345)).toBe('GG-12345')
  })

  it('pads invoice numbers to the padding setting', () => {
    const s = normaliseInvoiceSettings({ numberPrefix: 'INV-', numberPadding: 5, nextNumber: 1 })
    expect(formatInvoiceNumber(s, 42)).toBe('INV-00042')
    expect(formatInvoiceNumber(normaliseInvoiceSettings({ numberPrefix: 'R-', numberPadding: 0 }), 7)).toBe('R-7')
  })

  it('strips characters that are not letters, digits or dashes from an order prefix', () => {
    expect(sanitiseOrderPrefix(' GG-<b>1 ')).toBe('GG-b1')
    expect(sanitiseOrderPrefix(null)).toBe('')
  })
})

describe('orders list filters', () => {
  it('turns the bar picks into the generic list filters and reads them back', () => {
    const filters = applyOrderPicks([{ field: 'customerEmail', op: 'contains', value: 'x' }], {
      status: 'processing',
      payment: 'paid',
      from: '2026-10-01',
      to: '2026-10-13',
    })
    expect(filters).toEqual([
      { field: 'customerEmail', op: 'contains', value: 'x' },
      { field: 'status', op: 'equals', value: 'processing' },
      { field: 'paidAt', op: 'exists', value: 'true' },
      { field: 'createdAt', op: 'greater_than', value: '2026-10-01' },
      { field: 'createdAt', op: 'less_than', value: '2026-10-14' },
    ])
    expect(readOrderPicks(filters)).toEqual({ status: 'processing', payment: 'paid', from: '2026-10-01', to: '2026-10-13' })
  })

  it('maps the unpaid and refunded choices and ignores junk values', () => {
    expect(applyOrderPicks([], { ...EMPTY_ORDER_PICKS, payment: 'unpaid' })).toEqual([{ field: 'paidAt', op: 'exists', value: 'false' }])
    expect(readOrderPicks([{ field: 'refundedTotal', op: 'greater_than', value: '0' }]).payment).toBe('refunded')
    expect(readOrderPicks([{ field: 'status', op: 'equals', value: 'nope' }]).status).toBe('')
    expect(readOrderPicks([{ field: 'createdAt', op: 'greater_than', value: 'not a day' }]).from).toBe('')
  })

  it('adds days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('order and invoice numbers on a real D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let d1: D1Database

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    d1 = proxy.env.D1
    hoisted.d1 = d1
    const outcome = await runInternalMigrate(d1, consoleLogger)
    expect(outcome.errorCount).toBe(0)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  beforeEach(async () => {
    await d1.prepare('DELETE FROM eg_number_counters').run()
    await d1.prepare('DELETE FROM eg_orders').run()
    await d1.prepare('DELETE FROM eg_shop_settings').run()
  })

  const insertOrder = async (id: number, fields: { status?: string; paidAt?: string | null; orderNumber?: string | null; invoiceNumber?: string | null; firstName?: string; lastName?: string; email?: string }) => {
    await d1
      .prepare(
        `INSERT INTO eg_orders (id, status, amount, paid_at, order_number, invoice_number, shipping_address_first_name, shipping_address_last_name, customer_email, created_at, updated_at)
         VALUES (?1, ?2, 1000, ?3, ?4, ?5, ?6, ?7, ?8, '2026-10-13T10:00:00.000Z', '2026-10-13T10:00:00.000Z')`,
      )
      .bind(id, fields.status ?? 'pending', fields.paidAt ?? null, fields.orderNumber ?? null, fields.invoiceNumber ?? null, fields.firstName ?? null, fields.lastName ?? null, fields.email ?? null)
      .run()
  }
  const orderRow = async (id: number) => d1.prepare('SELECT order_number, invoice_number, status FROM eg_orders WHERE id = ?1').bind(id).first<{ order_number: string | null; invoice_number: string | null; status: string }>()

  it('gives 20 parallel allocations unique, sequential numbers', async () => {
    const got = await Promise.all(Array.from({ length: 20 }, () => takeNumber(d1, 'order', 1001)))
    expect(new Set(got).size).toBe(20)
    expect([...got].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => 1001 + i))
    expect(await takeNumber(d1, 'order', 1001)).toBe(1021)
  })

  it('never goes back when the start setting is lowered, and follows it when raised', async () => {
    expect(await takeNumber(d1, 'invoice', 1)).toBe(1)
    expect(await takeNumber(d1, 'invoice', 1)).toBe(2)
    expect(await takeNumber(d1, 'invoice', 1)).toBe(3)
    expect(await takeNumber(d1, 'invoice', 2)).toBe(4)
    expect(await takeNumber(d1, 'invoice', 50)).toBe(50)
    expect(await takeNumber(d1, 'invoice', 10)).toBe(51)
  })

  it('reads the settings and falls back to defaults when no settings row exists', async () => {
    expect(await readNumberingSettings(d1)).toMatchObject({ orderPrefix: '', orderStart: 1001 })
    expect((await readNumberingSettings(d1)).invoice).toMatchObject({ numberPrefix: 'INV-', nextNumber: 1, numberPadding: 5 })
  })

  it('uses the order prefix from settings and numbers new orders sequentially', async () => {
    await d1
      .prepare(`INSERT INTO eg_shop_settings (id, order_numbers_prefix, order_numbers_next_number) VALUES (1, 'GG-', 1001)`)
      .run()
    expect(await nextOrderNumber(d1)).toBe('GG-1001')
    expect(await nextOrderNumber(d1)).toBe('GG-1002')
  })

  it('gives paid orders an invoice number with the prefix and padding, once, and leaves unpaid orders alone', async () => {
    await d1
      .prepare(`INSERT INTO eg_shop_settings (id, invoice_number_prefix, invoice_next_number, invoice_number_padding) VALUES (1, 'TAX-', 7, 3)`)
      .run()
    await insertOrder(1, { status: 'pending' })
    await insertOrder(2, { status: 'processing', paidAt: '2026-10-13T10:05:00.000Z' })
    expect(await ensureInvoiceNumber(d1, 1)).toBeNull()
    expect((await orderRow(1))?.invoice_number).toBeNull()
    expect(await ensureInvoiceNumber(d1, 2)).toBe('TAX-007')
    expect(await ensureInvoiceNumber(d1, 2)).toBe('TAX-007')
    await insertOrder(3, { status: 'completed' })
    expect(await ensureInvoiceNumber(d1, 3)).toBe('TAX-008')
  })

  it('never reassigns an existing number, even if the settings change afterwards', async () => {
    await insertOrder(4, { status: 'processing', paidAt: '2026-10-13T10:05:00.000Z', orderNumber: 'GG-1004', invoiceNumber: 'INV-00004' })
    await d1.prepare(`INSERT INTO eg_shop_settings (id, invoice_next_number) VALUES (1, 1)`).run()
    expect(await ensureInvoiceNumber(d1, 4)).toBe('INV-00004')
    const before = await d1.prepare('SELECT last_value FROM eg_number_counters WHERE key = ?1').bind('invoice').first<{ last_value: number }>()
    expect(before).toBeNull()
    expect((await orderRow(4))?.invoice_number).toBe('INV-00004')
  })

  it('gives every caller of the same paid order the same invoice number, consuming one number', async () => {
    await insertOrder(5, { status: 'processing', paidAt: '2026-10-13T10:05:00.000Z' })
    const results = await Promise.all(Array.from({ length: 10 }, () => ensureInvoiceNumber(d1, 5)))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('INV-00001')
    expect(await takeNumber(d1, 'invoice', 1)).toBe(2)
  })

  it('finds orders by customer first or last name, case-insensitively', async () => {
    await insertOrder(10, { firstName: 'Grace', lastName: 'Gatsby' })
    await insertOrder(11, { firstName: 'Ann', lastName: 'Other' })
    const branches = await orderNameSearchBranches('grace gat')
    expect(branches).toEqual([{ id: { in: [10] } }])
    expect(await orderNameSearchBranches('OTHER')).toEqual([{ id: { in: [11] } }])
    expect(await orderNameSearchBranches('nobody')).toEqual([])
    expect(await orderNameSearchBranches('   ')).toEqual([])
  })
})
