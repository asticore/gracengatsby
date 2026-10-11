// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

vi.mock('@/features/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }))

import { ensureMigratedLocalDb } from '../helpers/migratedDb'

import { resolveD1Binding } from '@/cms/db/connect'
import { createEngine, type Engine } from '@/localapi/engine'
import { handleRestRequest } from '@/localapi/rest'
import { sendEmail } from '@/features/email'
import { isOrderStaff, ordersAccess } from '@/features/ecommerce/access'
import { normalizeEmail } from '@/features/ecommerce/lib/email'
import { runProductImport, IMPORT_MAX_ROWS } from '@/features/ecommerce/server/csvImport'
import { rawD1 } from '@/features/ecommerce/server/db'
import { runAbandonedCartReminders } from '@/features/ecommerce/server/abandoned'
import { markOrderPaid } from '@/features/ecommerce/server/orders'
import { couponReservations, couponUsesBy, loadPricedLines } from '@/features/ecommerce/server/pricing'
import { finalizePaidIntent } from '@/features/ecommerce/payments/stripeAdapter'
import { isVerifiedOwner } from '@/features/ecommerce/reviewEndpoint'
import { SQL } from '@/features/ecommerce/server/db'

type Doc = Record<string, any> & { id: number }

describe('shop review fixes (real engine and database)', () => {
  let engine: Engine
  const tag = `r${Date.now()}`
  const e = () =>
    engine as unknown as {
      create: (a: unknown) => Promise<Doc>
      update: (a: unknown) => Promise<Doc>
      findByID: (a: unknown) => Promise<Doc | null>
      find: (a: unknown) => Promise<{ docs: Doc[] }>
      delete: (a: unknown) => Promise<unknown>
      updateGlobal: (a: unknown) => Promise<Doc>
      findGlobal: (a: unknown) => Promise<Doc>
    }
  const productIds: number[] = []
  const orderIds: number[] = []

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
    await (await rawD1()).prepare('DELETE FROM eg_order_refunds WHERE order_id NOT IN (SELECT id FROM eg_orders)').run() // left by an interrupted run
  }, 300_000)

  afterAll(async () => {
    // Ids are reused once rows are deleted, so refunds must not outlive their orders.
    const d1 = await rawD1()
    for (const id of orderIds) await d1.prepare('DELETE FROM eg_order_refunds WHERE order_id = ?1').bind(id).run().catch((): void => undefined)
    for (const id of orderIds) await e().delete({ collection: 'orders', id, overrideAccess: true }).catch((): void => undefined)
    for (const id of productIds) await e().delete({ collection: 'products', id, overrideAccess: true }).catch((): void => undefined)
  })

  const makeProduct = async (data: Record<string, unknown>) => {
    const doc = await e().create({ collection: 'products', data: { _status: 'published', ...data }, overrideAccess: true, draft: false })
    productIds.push(doc.id)
    return doc
  }
  const product = async (id: number) => (await e().findByID({ collection: 'products', id, depth: 0, overrideAccess: true, draft: false }))!
  const makeOrder = async (data: Record<string, unknown>) => {
    const doc = await e().create({ collection: 'orders', data: { status: 'pending', amount: 1000, currency: 'AUD', ...data }, overrideAccess: true })
    orderIds.push(doc.id)
    return doc
  }
  const order = async (id: number) => (await e().findByID({ collection: 'orders', id, depth: 0, overrideAccess: true }))!
  const noteTexts = (doc: Doc) => ((doc.notes as { text: string }[]) ?? []).map((n) => n.text)

  describe('2 stock: atomic decrement, oversold, retry', () => {
    it('takes stock once, never reads-modifies-writes, and holds an oversold order', async () => {
      const p = await makeProduct({ title: `Stock ${tag}`, slug: `stock-${tag}`, priceInAUD: 10, manageStock: true, stockQty: 3, stockStatus: 'instock' })
      const line = { productId: p.id, variationId: null as string | null, name: 'Stock', quantity: 2 }
      const a = await makeOrder({ lineItems: [line] })
      const b = await makeOrder({ lineItems: [line] })
      // Two payments for the last 3 units, at the same time.
      await Promise.all([markOrderPaid(engine as never, a.id, {}), markOrderPaid(engine as never, b.id, {})])
      const after = await product(p.id)
      expect(after.stockQty).toBe(-1) // 3 - 2 - 2: both taken, the shortfall is visible
      expect(after.stockStatus).toBe('outofstock')
      const statuses = [(await order(a.id)).status, (await order(b.id)).status].sort()
      expect(statuses).toEqual(['on-hold', 'processing'])
      const all = [await order(a.id), await order(b.id)]
      const onHold = all.find((o) => o.status === 'on-hold')!
      expect(noteTexts(onHold).some((t) => t.startsWith('NEEDS ATTENTION: Oversold'))).toBe(true)
    })

    it('retries stock on a replayed payment when an earlier attempt left it unadjusted, and takes it only once', async () => {
      const p = await makeProduct({ title: `Retry ${tag}`, slug: `retry-${tag}`, priceInAUD: 10, manageStock: true, stockQty: 10 })
      const o = await makeOrder({ lineItems: [{ productId: p.id, variationId: null, name: 'Retry', quantity: 4 }] })
      await markOrderPaid(engine as never, o.id, {})
      expect((await product(p.id)).stockQty).toBe(6)
      const d1 = await rawD1()
      await d1.prepare(SQL.unflagStockAdjusted).bind(o.id).run() // simulate a failed first attempt
      await markOrderPaid(engine as never, o.id, {}) // webhook replay
      expect((await product(p.id)).stockQty).toBe(2)
      await markOrderPaid(engine as never, o.id, {}) // another replay: no double take
      expect((await product(p.id)).stockQty).toBe(2)
    })

    it('does not touch a product that does not manage stock', async () => {
      const p = await makeProduct({ title: `Free ${tag}`, slug: `free-${tag}`, priceInAUD: 10, manageStock: false, stockQty: 5 })
      const o = await makeOrder({ lineItems: [{ productId: p.id, variationId: null, name: 'Free', quantity: 2 }] })
      await markOrderPaid(engine as never, o.id, {})
      expect((await product(p.id)).stockQty).toBe(5)
      expect((await order(o.id)).status).toBe('processing')
    })

    it('counts the same product listed twice together when checking availability', async () => {
      const p = await makeProduct({ title: `Dup ${tag}`, slug: `dup-${tag}`, priceInAUD: 10, manageStock: true, stockQty: 3 })
      await expect(loadPricedLines(engine as never, [{ product: p.id, quantity: 2 }, { product: p.id, quantity: 2 }])).rejects.toThrow(/out of stock/i)
      await expect(loadPricedLines(engine as never, [{ product: p.id, quantity: 2 }, { product: p.id, quantity: 1 }])).resolves.toHaveLength(2)
    })
  })

  describe('8 late payment and amount mismatch', () => {
    it('flags a payment that lands on a cancelled order, once, and keeps the order cancelled', async () => {
      const o = await makeOrder({ status: 'cancelled', lineItems: [] })
      await markOrderPaid(engine as never, o.id, { paymentIntentId: 'pi_late' })
      await markOrderPaid(engine as never, o.id, { paymentIntentId: 'pi_late' })
      const after = await order(o.id)
      expect(after.status).toBe('cancelled')
      expect(noteTexts(after).filter((t) => t.startsWith('NEEDS ATTENTION: Late payment'))).toHaveLength(1)
    })

    it('records an amount mismatch and returns instead of throwing; the unpaid order is put on hold', async () => {
      const o = await makeOrder({ status: 'pending', amount: 1000, lineItems: [] })
      const result = await finalizePaidIntent(engine, { id: 'pi_x', amount: 900, amount_received: 900, metadata: { orderID: String(o.id) } } as never)
      expect(result).toEqual({ orderId: o.id, firstTime: false })
      const after = await order(o.id)
      expect(after.status).toBe('on-hold')
      expect(noteTexts(after).some((t) => t.startsWith('NEEDS ATTENTION:') && t.includes('does not match'))).toBe(true)
    })
  })

  describe('6 refund restock is bounded per line', () => {
    it('never restocks more than was sold, across refunds and a later cancel', async () => {
      const p = await makeProduct({ title: `Refund ${tag}`, slug: `refund-${tag}`, priceInAUD: 10, manageStock: true, stockQty: 10 })
      const o = await makeOrder({ amount: 10_000, lineItems: [{ productId: p.id, variationId: null, name: 'Refund', quantity: 3 }] })
      await markOrderPaid(engine as never, o.id, {})
      expect((await product(p.id)).stockQty).toBe(7)
      const refund = (items: unknown[]) => e().create({ collection: 'order-refunds', data: { order: o.id, amount: 100, method: 'manual', restock: true, items }, overrideAccess: true })
      const first = await refund([{ index: 0, quantity: 2 }])
      expect(first.items).toEqual([{ index: 0, quantity: 2 }])
      expect((await product(p.id)).stockQty).toBe(9)
      const second = await refund([{ index: 0, quantity: 5 }, { index: 9, quantity: 1 }]) // too many, and a line that does not exist
      expect(second.items).toEqual([{ index: 0, quantity: 1 }])
      expect((await product(p.id)).stockQty).toBe(10)
      const third = await refund([{ index: 0, quantity: 1 }])
      expect(third.items).toEqual([])
      expect((await product(p.id)).stockQty).toBe(10)
      await e().update({ collection: 'orders', id: o.id, data: { status: 'cancelled' }, overrideAccess: true })
      expect((await product(p.id)).stockQty).toBe(10) // everything was already put back
    })

    it('restocks nothing for an order whose stock was never taken', async () => {
      const p = await makeProduct({ title: `NoTake ${tag}`, slug: `notake-${tag}`, priceInAUD: 10, manageStock: true, stockQty: 4 })
      const o = await makeOrder({ status: 'processing', amount: 10_000, lineItems: [{ productId: p.id, variationId: null, name: 'x', quantity: 2 }] })
      const refund = await e().create({ collection: 'order-refunds', data: { order: o.id, amount: 100, method: 'manual', restock: true, items: [{ index: 0, quantity: 2 }] }, overrideAccess: true })
      expect(refund.items).toEqual([])
      expect((await product(p.id)).stockQty).toBe(4)
    })
  })

  describe('3 CSV import', () => {
    const run = (csv: string, dryRun = false) => runProductImport(engine as never, csv, { dryRun })
    const find = async (sku: string) => (await e().find({ collection: 'products', where: { sku: { equals: sku } }, overrideAccess: true, depth: 0, draft: false })).docs[0]

    it('leaves blank cells, absent columns and the product type alone on update', async () => {
      const sku = `K-${tag}`
      const made = await run(`Type,SKU,Name,Regular price,Short description\nvariable,${sku},Keep ${tag},40,Original text\n`)
      expect(made).toMatchObject({ created: 1, failed: 0 })
      const before = await find(sku)
      productIds.push(before.id)
      expect(before.productType).toBe('variable')
      const update = await run(`SKU,Name,Regular price,Short description\n${sku},Renamed ${tag},,\n`)
      expect(update).toMatchObject({ updated: 1, failed: 0 })
      const after = await find(sku)
      expect(after).toMatchObject({ title: `Renamed ${tag}`, priceInAUD: 40, shortDescription: 'Original text', productType: 'variable' })
    })

    it('keeps existing variation values when cells are blank, and attaches a variation listed before its parent', async () => {
      const sku = `V-${tag}`
      const first = `variation,${sku}-S,${sku},,,42,5,1,Size,S,\nvariable,${sku},,Var ${tag},1,40,,,Size,S | M,1\n`
      const head = 'Type,SKU,Parent SKU,Name,Published,Regular price,Stock,Manage stock,Attribute 1 name,Attribute 1 value(s),Attribute 1 variation\n'
      const created = await run(head + first)
      expect(created).toMatchObject({ created: 1, failed: 0 })
      const parent = await find(sku)
      productIds.push(parent.id)
      expect(parent.variations).toHaveLength(1)
      expect(parent.variations[0]).toMatchObject({ sku: `${sku}-S`, priceInAUD: 42, stockQty: 5, manageStock: true, backorders: 'no', enabled: true })
      // A variation row with blank cells must not null out price, stock or the flags.
      const blank = await run(head + `variation,${sku}-S,${sku},,,,,,Size,S,\n`)
      expect(blank.failed).toBe(0)
      const same = (await find(sku)).variations[0]
      expect(same).toMatchObject({ sku: `${sku}-S`, priceInAUD: 42, stockQty: 5, manageStock: true, backorders: 'no', enabled: true })
      // Orphan path (parent not in the file) must not write nulls either.
      const orphan = await run('Type,SKU,Parent SKU,Regular price,Attribute 1 name,Attribute 1 value(s)\nvariation,,' + sku + ',,Size,S\n')
      expect(orphan.failed).toBe(0)
      expect((await find(sku)).variations[0]).toMatchObject({ priceInAUD: 42, stockQty: 5 })
    })

    it('refuses a new product whose SKU a variation already uses, and a taken slug on update', async () => {
      const vsku = `V-${tag}-S`
      const clash = await run(`SKU,Name,Regular price\n${vsku},Clash ${tag},5\n`)
      expect(clash.failed).toBe(1)
      expect(clash.errors.some((x) => /variation/i.test(x.message))).toBe(true)
      const a = `SA-${tag}`
      const b = `SB-${tag}`
      expect(await run(`SKU,Name,Slug,Regular price\n${a},A ${tag},slug-a-${tag},5\n${b},B ${tag},slug-b-${tag},5\n`)).toMatchObject({ created: 2 })
      productIds.push((await find(a)).id, (await find(b)).id)
      const taken = await run(`SKU,Slug\n${b},slug-a-${tag}\n`)
      expect(taken.failed).toBe(1)
      expect((await find(b)).slug).toBe(`slug-b-${tag}`)
    })

    it('refuses a file over the row limit without applying any of it', async () => {
      const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `BIG-${tag}-${i},Big ${i},1`).join('\n')
      const report = await run(`SKU,Name,Regular price\n${rows}\n`)
      expect(report).toMatchObject({ created: 0, updated: 0 })
      expect(report.errors[0].message).toMatch(/split/i)
      expect(await find(`BIG-${tag}-0`)).toBeUndefined()
    })
  })

  describe('4 where / sort on fields the caller cannot read', () => {
    it('rejects an anonymous filter or sort on a hidden review email, but allows readable fields', async () => {
      const find = (extra: Record<string, unknown>) => e().find({ collection: 'product-reviews', overrideAccess: false, user: null, depth: 0, ...extra })
      await expect(find({ where: { email: { like: 'a' } } })).rejects.toThrow(/cannot filter/i)
      await expect(find({ where: { and: [{ status: { equals: 'approved' } }, { or: [{ email: { equals: 'a@b.co' } }] }] } })).rejects.toThrow(/cannot filter/i)
      await expect(find({ sort: '-email' })).rejects.toThrow(/cannot sort/i)
      await expect(find({ where: { rating: { equals: 5 } }, sort: '-rating' })).resolves.toBeTruthy()
      // staff can
      await expect(find({ user: { id: 1, roles: ['admin'] }, where: { email: { like: 'a' } } })).resolves.toBeTruthy()
    })

    it('rejects a customer filtering their orders by staff-only fields', async () => {
      const customer = { id: 987654, roles: ['customer'] }
      const find = (where: unknown) => e().find({ collection: 'orders', overrideAccess: false, user: customer, depth: 0, where })
      await expect(find({ paymentIntentId: { like: 'pi_' } })).rejects.toThrow(/cannot filter/i)
      await expect(find({ notes: { like: 'x' } })).rejects.toThrow(/cannot filter/i)
      await expect(find({ status: { equals: 'processing' } })).resolves.toBeTruthy()
    })

    it('answers 400 over REST', async () => {
      const res = await handleRestRequest(new Request('http://x/api/product-reviews?where[email][like]=a%25'), ['product-reviews'], engine as never)
      expect(res!.status).toBe(400)
    })
  })

  describe('5 coupons: reservations and normalised emails', () => {
    it('normalises gmail-like addresses', () => {
      expect(normalizeEmail(' Jo.Doe+Sale@Gmail.com ')).toBe('jodoe@gmail.com')
      expect(normalizeEmail('jo.doe@googlemail.com')).toBe('jodoe@gmail.com')
      expect(normalizeEmail('jo.doe+a@example.com')).toBe('jo.doe@example.com')
    })

    it('counts paid uses by the same person and recent pending checkouts, but not stale or own-cart ones', async () => {
      const code = `save${tag}`
      const coupon = [{ code, couponId: 1 }]
      await makeOrder({ status: 'completed', customerEmail: `j.doe${tag}+x@gmail.com`, couponLines: coupon, cartId: 1 })
      await makeOrder({ status: 'pending', customerEmail: `jdoe${tag}@gmail.com`, couponLines: coupon, cartId: 2 })
      const email = `jdoe${tag}@gmail.com`
      expect(await couponUsesBy(engine as never, code, email)).toBe(2)
      expect(await couponUsesBy(engine as never, code, email, { excludeCartId: 2 })).toBe(1)
      expect(await couponUsesBy(engine as never, code, email, { now: new Date(Date.now() + 3_600_000) })).toBe(1) // the reservation has lapsed
      expect(await couponReservations(engine as never, code)).toBe(1)
      expect(await couponReservations(engine as never, code, { excludeCartId: 2 })).toBe(0)
    })
  })

  describe('12 reviews', () => {
    it('only a paid order makes a verified owner, matched on the normalised email', async () => {
      const p = await makeProduct({ title: `Rev ${tag}`, slug: `rev-${tag}`, priceInAUD: 3 })
      await makeOrder({ status: 'pending', customerEmail: `pend${tag}@x.co`, items: [{ product: p.id, quantity: 1 }] })
      await makeOrder({ status: 'completed', customerEmail: `p.aid${tag}@gmail.com`, items: [{ product: p.id, quantity: 1 }] })
      expect(await isVerifiedOwner(engine as never, `pend${tag}@x.co`, p.id)).toBe(false)
      expect(await isVerifiedOwner(engine as never, `paid${tag}+z@gmail.com`, p.id)).toBe(true)
    })
  })

  describe('7 abandoned carts', () => {
    it('emails only known addresses, one per address per 7 days, and honours an unsubscribe for every cart', async () => {
      const d1 = await rawD1()
      const prior = (await e().findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as Doc
      await e().updateGlobal({ slug: 'shop-settings', data: { abandonedCart: { ...(prior.abandonedCart ?? {}), enabled: true, firstDelayHours: 1, secondDelayHours: 24, maxReminders: 2 } }, overrideAccess: true })
      vi.stubEnv('ENGAGE_SECRET', 'test-secret')
      try {
        const long = new Date(Date.now() - 3 * 3_600_000).toISOString()
        const cart = async (email: string) => {
          const id = (await d1.prepare('INSERT INTO eg_carts (email, updated_at) VALUES (?1, ?2)').bind(email, long).run()).meta.last_row_id as number
          await d1.prepare('INSERT INTO eg_carts_items (_order, _parent_id, id, quantity) VALUES (1, ?1, ?2, 1)').bind(id, `item-${id}`).run()
          return id
        }
        const stranger = `stranger${tag}@x.co`
        const buyer = `buyer${tag}@x.co`
        await makeOrder({ status: 'completed', customerEmail: buyer })
        await cart(stranger)
        const c1 = await cart(buyer)
        const c2 = await cart(buyer)
        const sent = vi.mocked(sendEmail)
        sent.mockClear()
        await runAbandonedCartReminders(engine as never)
        const recipients = sent.mock.calls.map((c) => (c[0] as { to: string }).to)
        expect(recipients).not.toContain(stranger)
        expect(recipients.filter((to) => to === buyer)).toHaveLength(1) // two carts, one email
        // Unsubscribing one cart suppresses the address everywhere.
        await d1.prepare(SQL.cartUnsubscribe).bind(c1).run()
        const flags = (await d1.prepare('SELECT id, unsubscribed FROM eg_carts WHERE id IN (?1, ?2)').bind(c1, c2).all<{ id: number; unsubscribed: number }>()).results
        expect(flags.every((f) => f.unsubscribed === 1)).toBe(true)
        await cart(buyer)
        sent.mockClear()
        await runAbandonedCartReminders(engine as never)
        expect(sent.mock.calls.map((c) => (c[0] as { to: string }).to)).not.toContain(buyer)
      } finally {
        vi.unstubAllEnvs()
        await e().updateGlobal({ slug: 'shop-settings', data: { abandonedCart: prior.abandonedCart ?? { enabled: false } }, overrideAccess: true })
        await d1.prepare("DELETE FROM eg_carts WHERE email LIKE ?1").bind(`%${tag}@x.co`).run()
      }
    })
  })

  describe('13 order access', () => {
    it('uses resolveAccess: own-scope custom roles are not staff, and a customer reads only their own orders', () => {
      const own = { id: 5, roles: ['editor'], customRolePermissions: { orders: { read: true, scope: 'own' } } }
      expect(isOrderStaff(own as never)).toBe(false)
      expect(ordersAccess('read')({ req: { user: own } } as never)).toEqual({ customer: { equals: 5 } })
      const all = { id: 6, roles: ['editor'], customRolePermissions: { orders: { read: true, update: true } } }
      expect(isOrderStaff(all as never)).toBe(true)
      expect(ordersAccess('update')({ req: { user: all } } as never)).toBe(true)
      expect(ordersAccess('update')({ req: { user: own } } as never)).toBe(false)
    })
  })
})
