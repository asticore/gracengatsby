// @vitest-environment node
// Shop reports and display currencies (wave 19) against a real migrated D1: the report SQL must run
// on SQLite and return the numbers worked out by hand here, and the display-currency rates refresh
// must store and skip correctly. The rate API is faked; nothing leaves the test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate, type InternalMigrateResult } from '@/migrations/runInternalMigrate'
import { resolveRange } from '@/features/shopReports/range'
import { loadAbandoned, loadLowStock } from '@/features/shopReports/queriesStock'
import { loadCategories, loadCoupons, loadKpis, loadLocations, loadPayments, loadSeries, loadTopProducts } from '@/features/shopReports/queries'
import { listDisplayCurrencyRows, saveDisplayCurrencyRows, storefrontOptions } from '@/features/ecommerce/server/displayCurrencies'
import { refreshDisplayRates } from '@/features/ecommerce/server/displayRates'
import { validateDisplayCurrencies } from '@/features/ecommerce/lib/displayCurrencyRows'

type Db = { prepare: (sql: string) => { bind: (...a: unknown[]) => { all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> } } }

const RANGE = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-14' }, new Date('2026-10-14T09:00:00Z'))
const PAID_LINES = (lines: unknown[]) => JSON.stringify(lines)

describe('shop reports and display currencies on a migrated D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let outcome: InternalMigrateResult
  let db: Db

  const run = async (sql: string, ...args: unknown[]) => {
    await db.prepare(sql).bind(...args).run()
  }

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    outcome = await runInternalMigrate(proxy.env.D1, consoleLogger)
    db = proxy.env.D1 as unknown as Db

    await run(`INSERT INTO eg_products (id, title, category, manage_stock, stock_qty, sku, updated_at, created_at) VALUES (1, 'Mug', 'physical', 1, 1, 'MUG-1', '2026-09-01', '2026-09-01')`)
    await run(`INSERT INTO eg_products (id, title, category, manage_stock, stock_qty, sku, updated_at, created_at) VALUES (2, 'eBook', 'digital', 0, 0, 'EB-1', '2026-09-01', '2026-09-01')`)

    const order = (id: number, status: string, amount: number, paidAt: string | null, email: string | null, lines: unknown[], coupons: unknown[], country: string | null, state: string | null) =>
      run(
        `INSERT INTO eg_orders (id, order_number, status, amount, subtotal, discount_total, shipping_total, tax_total, refunded_total, customer_email, line_items, coupon_lines, paid_at, created_at, updated_at, shipping_address_country, shipping_address_state, currency)
         VALUES (?1, ?2, ?3, ?4, ?4, 0, 0, 0, 0, ?5, ?6, ?7, ?8, ?11, ?11, ?9, ?10, 'AUD')`,
        id,
        `T${id}`,
        status,
        amount,
        email,
        PAID_LINES(lines),
        PAID_LINES(coupons),
        paidAt,
        country,
        state,
        '2026-09-25T10:00:00.000Z',
      )
    // Paid in range
    await order(1, 'completed', 5000, '2026-10-02T10:00:00.000Z', 'a@example.com', [{ productId: 1, name: 'Mug', quantity: 2, lineCents: 4000, discountCents: 0 }, { productId: 2, name: 'eBook', quantity: 1, lineCents: 1000, discountCents: 0 }], [{ code: 'save10', discountCents: 500 }], 'AU', 'NSW')
    await order(3, 'refunded', 2000, '2026-10-05T10:00:00.000Z', 'b@example.com', [{ productId: 2, name: 'eBook', quantity: 1, lineCents: 2000, discountCents: 0 }], [], 'NZ', null)
    await order(5, 'completed', 1000, '2026-10-06T10:00:00.000Z', 'b@example.com', [{ productId: null, name: 'Gift card', quantity: 1, lineCents: 1000, discountCents: 0, isGiftCard: true }], [], null, null)
    // Paid before the range: makes a@example.com a returning customer.
    await order(2, 'processing', 3000, '2026-09-20T10:00:00.000Z', 'a@example.com', [{ productId: 1, name: 'Mug', quantity: 1, lineCents: 3000, discountCents: 0 }], [], 'AU', 'VIC')
    // Not counted: unpaid, and a pending order.
    await order(4, 'pending', 9999, null, 'c@example.com', [{ productId: 1, name: 'Mug', quantity: 9, lineCents: 9999, discountCents: 0 }], [], 'AU', 'NSW')

    await run(`INSERT INTO eg_transactions (id, order_id, payment_method, updated_at, created_at) VALUES (1, 1, 'stripe', '2026-10-02', '2026-10-02')`)
    await run(`INSERT INTO eg_order_refunds (id, order_id, amount, status, created_at, updated_at) VALUES (1, 3, 500, 'completed', '2026-10-07T10:00:00.000Z', '2026-10-07')`)
    await run(`INSERT INTO eg_order_refunds (id, order_id, amount, status, created_at, updated_at) VALUES (2, 3, 100, 'failed', '2026-10-07T10:00:00.000Z', '2026-10-07')`)

    await run(`INSERT INTO eg_carts (id, email, reminders_sent, recovered_at, purchased_at, updated_at, created_at) VALUES (1, 'x@example.com', 1, NULL, NULL, '2026-10-03T10:00:00.000Z', '2026-10-03')`)
    await run(`INSERT INTO eg_carts (id, email, reminders_sent, recovered_at, purchased_at, updated_at, created_at) VALUES (2, 'y@example.com', 1, '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z', '2026-10-03T10:00:00.000Z', '2026-10-03')`)
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('finishes the migration with zero errors and creates the display currency table', async () => {
    expect(outcome.errorCount).toBe(0)
    const rows = (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='eg_shop_display_currencies'`).bind().all<{ name: string }>()).results
    expect(rows.map((r) => r.name)).toEqual(['eg_shop_display_currencies'])
  })

  // The D1 type in these helpers is the platform type; the proxy's binding is the same API.
  const d1 = () => proxy.env.D1 as never

  it('counts paid orders, sales, discounts and refunds for the range', async () => {
    const kpis = await loadKpis(d1(), RANGE)
    expect(kpis.orders).toBe(3)
    expect(kpis.revenueCents).toBe(8000)
    expect(kpis.refundCount).toBe(1)
    expect(kpis.refundsCents).toBe(500)
    expect(kpis.unitsSold).toBe(4) // gift card lines are not units sold
    expect(kpis.customers).toBe(2)
    expect(kpis.returningCustomers).toBe(1)
    expect(kpis.newCustomers).toBe(1)
  })

  it('builds the revenue series by day, with only paid days', async () => {
    const series = await loadSeries(d1(), RANGE, 'day')
    expect(series.map((s) => [s.bucket, s.orders, s.revenueCents])).toEqual([
      ['2026-10-02', 1, 5000],
      ['2026-10-05', 1, 2000],
      ['2026-10-06', 1, 1000],
    ])
  })

  it('ranks products by net line revenue and pages them', async () => {
    const page = await loadTopProducts(d1(), RANGE, 1, 1)
    expect(page.total).toBe(2)
    expect(page.rows[0]).toMatchObject({ name: 'Mug', units: 2, revenueCents: 4000, category: 'physical' })
    const second = await loadTopProducts(d1(), RANGE, 2, 1)
    expect(second.rows[0]).toMatchObject({ name: 'eBook', units: 2, revenueCents: 3000 })
  })

  it('splits revenue by product category', async () => {
    const rows = await loadCategories(d1(), RANGE)
    expect(rows.map((r) => [r.category, r.revenueCents])).toEqual([
      ['physical', 4000],
      ['digital', 3000],
    ])
  })

  it('counts coupon uses and the discount they gave', async () => {
    expect(await loadCoupons(d1(), RANGE)).toEqual([{ code: 'SAVE10', uses: 1, discountCents: 500 }])
  })

  it('groups sales by payment method, with orders that had none shown as none', async () => {
    const rows = await loadPayments(d1(), RANGE)
    expect(rows).toEqual([
      { method: 'stripe', orders: 1, revenueCents: 5000 },
      { method: 'none', orders: 2, revenueCents: 3000 },
    ])
  })

  it('groups sales by shipping country and state', async () => {
    const page = await loadLocations(d1(), RANGE, 1, 10)
    expect(page.total).toBe(3)
    expect(page.rows[0]).toMatchObject({ country: 'AU', state: 'NSW', revenueCents: 5000 })
    expect(page.rows.map((r) => r.country)).toContain('Not given')
  })

  it('lists only managed products at or under their low stock level', async () => {
    const page = await loadLowStock(d1(), 1, 10)
    expect(page.rows.map((r) => r.title)).toEqual(['Mug'])
    expect(page.rows[0]).toMatchObject({ sku: 'MUG-1', stockQty: 1, threshold: 2 })
  })

  it('counts abandoned carts and recoveries', async () => {
    const numbers = await loadAbandoned(d1(), RANGE)
    expect(numbers.abandoned).toBe(1) // cart 2 was bought, so it is not left behind
    expect(numbers.reminded).toBe(2)
    expect(numbers.recovered).toBe(1)
    expect(numbers.recoveryRatePct).toBe(50)
  })

  it('saves the display currency list, and refreshes automatic rates once a day', async () => {
    const checked = validateDisplayCurrencies(
      [
        { code: 'USD', enabled: true, rateMode: 'auto', manualRate: null },
        { code: 'JPY', enabled: true, rateMode: 'auto', manualRate: null },
        { code: 'EUR', enabled: true, rateMode: 'manual', manualRate: '0.6' },
      ],
      'AUD',
    )
    expect(checked.error).toBeNull()
    const now = new Date('2026-10-14T09:00:00Z')
    await saveDisplayCurrencyRows(d1(), checked.rows, now)
    expect((await listDisplayCurrencyRows(d1())).map((r) => r.code)).toEqual(['USD', 'JPY', 'EUR'])

    const calls: string[] = []
    const fakeFetch = async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ result: 'success', rates: { USD: 0.65, JPY: 98.5 } }), { status: 200 })
    }
    const first = await refreshDisplayRates(d1(), 'AUD', now, { fetchFn: fakeFetch })
    expect(first.status).toBe('updated')
    expect(first.codes.sort()).toEqual(['JPY', 'USD'])
    expect(calls).toEqual(['https://open.er-api.com/v6/latest/AUD'])

    const options = storefrontOptions(await listDisplayCurrencyRows(d1()), 'AUD')
    expect(options.map((o) => [o.code, o.rate, o.digits])).toEqual([
      ['USD', 0.65, 2],
      ['JPY', 98.5, 0],
      ['EUR', 0.6, 2],
    ])

    const later = new Date('2026-10-14T15:00:00Z')
    const second = await refreshDisplayRates(d1(), 'AUD', later, { fetchFn: fakeFetch })
    expect(second.status).toBe('skipped')
    expect(calls).toHaveLength(1)

    // A different shop currency makes the stored automatic rates unusable until they are fetched again.
    expect(storefrontOptions(await listDisplayCurrencyRows(d1()), 'NZD').map((o) => o.code)).toEqual(['EUR'])
  })

  it('leaves the list alone and reports a failure when the rate service is down', async () => {
    const down = async () => new Response('nope', { status: 503 })
    await expect(refreshDisplayRates(d1(), 'AUD', new Date('2026-10-20T00:00:00Z'), { fetchFn: down, force: true })).rejects.toThrow('503')
    expect((await listDisplayCurrencyRows(d1())).map((r) => r.code)).toEqual(['USD', 'JPY', 'EUR'])
  })
})
