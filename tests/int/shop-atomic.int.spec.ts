// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { SQL } from '@/features/ecommerce/server/db'

describe('shop atomic SQL (real D1)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let d1: D1Database
  const run = async (statement: string, ...p: unknown[]) => (await d1.prepare(statement).bind(...p).run()).meta.changes as number

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    d1 = proxy.env.D1
    await runInternalMigrate(d1, consoleLogger)
    // running the migration set again must stay a no-op (idempotent)
    const second = await runInternalMigrate(d1, consoleLogger)
    expect(second.errorCount).toBe(0)
  }, 300_000)
  afterAll(async () => proxy.dispose())

  it('marks an order paid exactly once', async () => {
    await run(`INSERT INTO eg_orders (id, status, amount) VALUES (1, 'pending', 1000)`)
    expect(await run(SQL.markPaid, 1, 'now')).toBe(1)
    expect(await run(SQL.markPaid, 1, 'now')).toBe(0)
  })

  it('never lets refunds exceed the paid amount, even back to back', async () => {
    await run(`INSERT INTO eg_orders (id, status, amount, refunded_total) VALUES (2, 'processing', 1000, 0)`)
    expect(await run(SQL.reserveRefund, 2, 600)).toBe(1)
    expect(await run(SQL.reserveRefund, 2, 600)).toBe(0)
    expect(await run(SQL.reserveRefund, 2, 400)).toBe(1)
    expect(await run(SQL.reserveRefund, 2, 1)).toBe(0)
    await run(SQL.releaseRefund, 2, 400)
    expect(await run(SQL.reserveRefund, 2, 400)).toBe(1)
    await run(`INSERT INTO eg_orders (id, status, amount) VALUES (3, 'pending', 1000)`)
    expect(await run(SQL.reserveRefund, 3, 100)).toBe(0) // unpaid order
  })

  it('counts a coupon use only while under the limit, and flags apply once', async () => {
    await run(`INSERT INTO eg_coupons (id, code, type, usage_limit, usage_count) VALUES (1, 'once', 'percent', 2, 0)`)
    expect(await run(SQL.redeemCoupon, 1)).toBe(1)
    expect(await run(SQL.redeemCoupon, 1)).toBe(1)
    expect(await run(SQL.redeemCoupon, 1)).toBe(0)
    await expect(run(`INSERT INTO eg_coupons (code, type) VALUES ('once', 'percent')`)).rejects.toThrow()
    expect(await run(SQL.flagCouponApplied, 1)).toBe(1)
    expect(await run(SQL.flagCouponApplied, 1)).toBe(0)
  })
})
