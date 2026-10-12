import type { StockFields } from '../stock'
import { rawD1, runChanges, SQL } from './db'
import { stockAlerts, sendStockAlerts, type StockAlert } from '../stockAlerts'
import { consumeStoredValue, issueGiftCards } from './storedValue'
import { sendAdminAttentionEmail, sendAdminNewOrderEmail, sendOrderEmail } from './emails'

type Doc = Record<string, unknown>
type Engine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findByID: (a: unknown) => Promise<Doc | null>
  update: (a: unknown) => Promise<Doc>
  create: (a: unknown) => Promise<Doc>
  findGlobal: (a: unknown) => Promise<Doc>
}

export type OrderNote = { id: string; type: 'internal' | 'customer'; text: string; author: string; createdAt: string }
type LineItem = { productId?: number | string; variationId?: string | null; quantity?: number }

/** Appends a note. Not atomic across concurrent writers (notes are low volume); never throws. */
export async function addOrderNote(engine: Engine, orderId: number, note: { type: 'internal' | 'customer'; text: string; author: string }): Promise<OrderNote | null> {
  try {
    const order = await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
    if (!order) return null
    const entry: OrderNote = { id: crypto.randomUUID(), type: note.type, text: note.text.slice(0, 5000), author: note.author.slice(0, 120), createdAt: new Date().toISOString() }
    const notes = Array.isArray(order.notes) ? (order.notes as OrderNote[]) : []
    await engine.update({ collection: 'orders', id: orderId, data: { notes: [...notes, entry] }, overrideAccess: true })
    if (entry.type === 'customer') await sendOrderEmail(engine, order, 'customerNote', entry.text)
    return entry
  } catch {
    return null
  }
}

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: number }).id) : Number(v) || null)

type StockOutcome = { oversold: string[]; failed: string[]; applied: Array<{ line: LineItem; qty: number }> }

const STATUS_SQL = `CASE WHEN COALESCE(stock_qty,0) > 0 THEN 'instock' WHEN backorders IN ('notify','yes') THEN 'onbackorder' ELSE 'outofstock' END`

/**
 * Applies a stock delta to each line (negative = sell). The decrement is ONE conditional SQL UPDATE per line
 * (`stock_qty = stock_qty - n WHERE stock_qty >= n OR backorders allowed`), so two payments racing for the last
 * unit cannot both take it. When stock is not enough the line is still taken (quantity goes below zero, so a later
 * restock stays symmetric) and reported as `oversold`; the caller flags the order. Products that do not track stock
 * are untouched. Errors are collected, never swallowed: the caller decides what to do with `failed`.
 */
async function applyStock(engine: Engine, lines: LineItem[], sign: 1 | -1, only?: Map<number, number>): Promise<StockOutcome> {
  const out: StockOutcome = { oversold: [], failed: [], applied: [] }
  const d1 = await rawD1()
  const alerts: StockAlert[] = []
  for (const [index, line] of lines.entries()) {
    const productId = idOf(line.productId)
    const qty = only ? (only.get(index) ?? 0) : (line.quantity ?? 0)
    if (!productId || !Number.isInteger(qty) || qty <= 0) continue
    const label = String((line as { name?: string }).name ?? `line ${index + 1}`)
    try {
      const product = await engine.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true, draft: false })
      if (!product) continue
      const variations = Array.isArray(product.variations) ? (product.variations as (StockFields & { id?: string })[]) : []
      const variation = line.variationId ? variations.find((v) => v.id === line.variationId) : undefined
      let table: 'eg_products_variations' | 'eg_products' | null = null
      let key: [string, ...unknown[]] | null = null
      let before = 0
      if (variation && variation.manageStock) {
        table = 'eg_products_variations'
        before = Number(variation.stockQty ?? 0)
        key = ['id = ?2 AND _parent_id = ?3', variation.id, productId]
      } else if (product.manageStock === true) {
        table = 'eg_products'
        before = Number(product.stockQty ?? 0)
        key = ['id = ?2', productId]
      } else if (product.manageStock === undefined || product.manageStock === null) {
        // Rows from before the catalogue fields existed: the old single `inventory` counter, only when it is tracking something.
        if (typeof product.inventory === 'number' && product.inventory > 0) {
          await d1.prepare(`UPDATE eg_products SET inventory = MAX(0, COALESCE(inventory,0) + ?1) WHERE id = ?2`).bind(sign * qty, productId).run()
          out.applied.push({ line, qty })
        }
        continue
      }
      if (!table || !key) continue
      const [where, ...params] = key
      if (sign === 1) {
        await d1.prepare(`UPDATE ${table} SET stock_qty = COALESCE(stock_qty,0) + ?1 WHERE ${where} AND manage_stock = 1`).bind(qty, ...params).run()
      } else {
        const taken = await runChanges(d1, `UPDATE ${table} SET stock_qty = COALESCE(stock_qty,0) - ?1 WHERE ${where} AND manage_stock = 1 AND (COALESCE(stock_qty,0) >= ?1 OR backorders IN ('notify','yes'))`, qty, ...params)
        if (taken === 0) {
          // Not enough left. Take it anyway (the customer has paid) and say so.
          await d1.prepare(`UPDATE ${table} SET stock_qty = COALESCE(stock_qty,0) - ?1 WHERE ${where} AND manage_stock = 1`).bind(qty, ...params).run()
          out.oversold.push(label)
        }
      }
      await d1.prepare(`UPDATE ${table} SET stock_status = ${STATUS_SQL} WHERE ${where} AND manage_stock = 1 AND ?1 IS NOT NULL`).bind(qty, ...params).run()
      out.applied.push({ line, qty })
      if (sign === -1) {
        const after = before - qty
        const was = { ...product, ...(variation ? { variations: variations.map((v) => (v === variation ? { ...v, stockQty: before } : v)) } : { stockQty: before }) }
        const now = { ...product, ...(variation ? { variations: variations.map((v) => (v === variation ? { ...v, stockQty: after } : v)) } : { stockQty: after }) }
        alerts.push(...stockAlerts(was as never, now as never))
      }
    } catch (error) {
      out.failed.push(`${label}: ${error instanceof Error ? error.message : 'stock update failed'}`)
    }
  }
  if (alerts.length > 0) await sendStockAlerts(engine as never, alerts)
  return out
}

/** Quantity per line index already put back by earlier refunds that asked for a restock. */
export async function restockedSoFar(engine: Engine, orderId: number): Promise<Map<number, number>> {
  const done = new Map<number, number>()
  try {
    const { docs } = (await engine.find({ collection: 'order-refunds', where: { order: { equals: orderId } }, limit: 500, depth: 0, overrideAccess: true })) as { docs: Doc[] }
    for (const refund of docs) {
      if (!refund.restock) continue
      for (const r of (Array.isArray(refund.items) ? refund.items : []) as { index?: number; quantity?: number }[]) {
        if (Number.isInteger(r.index) && (r.quantity ?? 0) > 0) done.set(r.index as number, (done.get(r.index as number) ?? 0) + (r.quantity as number))
      }
    }
  } catch { /* none recorded */ }
  return done
}

/** Puts a cancelled/refunded order's items back in stock, once (guarded by the stockAdjusted flag). */
export async function restockOrder(engine: Engine, order: Doc, reason: string, only?: Map<number, number>): Promise<void> {
  const id = Number(order.id)
  const lines = (Array.isArray(order.lineItems) ? order.lineItems : []) as LineItem[]
  const d1 = await rawD1()
  if (only) {
    // Partial (refund) restock: only lines whose stock was taken, and never more than was sold.
    if (!order.stockAdjusted) return
    const result = await applyStock(engine, lines, 1, only)
    if (result.failed.length > 0) await addOrderNote(engine, id, { type: 'internal', text: `Restock problem (${reason}): ${result.failed.join('; ')}`, author: 'System' })
    else await addOrderNote(engine, id, { type: 'internal', text: `Items restocked (${reason}).`, author: 'System' })
    return
  }
  if ((await runChanges(d1, SQL.unflagStockAdjusted, id)) === 0) return
  // Whatever earlier refunds already restocked must not be put back twice.
  const already = await restockedSoFar(engine, id)
  const rest = new Map<number, number>()
  for (const [index, line] of lines.entries()) {
    const left = (line.quantity ?? 0) - (already.get(index) ?? 0)
    if (left > 0) rest.set(index, left)
  }
  const result = await applyStock(engine, lines, 1, rest)
  if (result.failed.length > 0) {
    await runChanges(d1, SQL.flagStockAdjusted, id) // let a later cancel/refund try again
    await addOrderNote(engine, id, { type: 'internal', text: `Restock failed (${reason}): ${result.failed.join('; ')}`, author: 'System' })
    return
  }
  await addOrderNote(engine, id, { type: 'internal', text: `Items restocked (${reason}).`, author: 'System' })
}

const ATTENTION = 'NEEDS ATTENTION: '

/** Flags an order for staff: an internal note that starts with NEEDS ATTENTION, plus an email to the shop admin. Never throws. */
export async function flagAttention(engine: Engine, orderId: number, text: string): Promise<void> {
  await addOrderNote(engine, orderId, { type: 'internal', text: ATTENTION + text, author: 'System' })
  await sendAdminAttentionEmail(engine, orderId, text)
}

/** A payment that does not match the order total: note it, hold the order if it was still unpaid, and tell the admin. */
export async function flagMismatch(engine: Engine, orderId: number, text: string): Promise<void> {
  const d1 = await rawD1()
  await runChanges(d1, `UPDATE eg_orders SET status = 'on-hold' WHERE id = ?1 AND status IN ('pending','failed')`, orderId)
  await flagAttention(engine, orderId, text)
}

/** Takes the order's stock once. Oversold lines or errors are noted; oversold puts a processing order on hold. */
async function takeStock(engine: Engine, order: Doc, orderId: number): Promise<{ oversold: boolean }> {
  const d1 = await rawD1()
  if ((await runChanges(d1, SQL.flagStockAdjusted, orderId)) === 0) return { oversold: false }
  const lines = (Array.isArray(order.lineItems) ? order.lineItems : []) as LineItem[]
  let result: StockOutcome
  try {
    result = await applyStock(engine, lines, -1)
  } catch (error) {
    result = { oversold: [], failed: [error instanceof Error ? error.message : 'stock update failed'], applied: [] }
  }
  if (result.failed.length > 0) {
    // Put back what was taken, leave the flag clear so a replayed webhook retries, and say so.
    try {
      await applyStock(engine, lines, 1, new Map(result.applied.map((a) => [lines.indexOf(a.line), a.qty])))
    } catch { /* noted below */ }
    await runChanges(d1, SQL.unflagStockAdjusted, orderId)
    await addOrderNote(engine, orderId, { type: 'internal', text: `Stock was not updated (will retry): ${result.failed.join('; ')}`, author: 'System' })
    return { oversold: false }
  }
  if (result.oversold.length > 0) {
    await runChanges(d1, `UPDATE eg_orders SET status = 'on-hold' WHERE id = ?1 AND status = 'processing'`, orderId)
    await flagAttention(engine, orderId, `Oversold: not enough stock for ${result.oversold.join(', ')}. The order is on hold.`)
    return { oversold: true }
  }
  return { oversold: false }
}

/**
 * Marks a pending order paid. Idempotent: the status flip is one conditional
 * UPDATE, so a replayed webhook or a webhook racing the browser confirm does the
 * side effects (stock, coupon usage, cart, emails) exactly once.
 */
export async function markOrderPaid(engine: Engine, orderId: number, info: { paymentIntentId?: string; transactionId?: number }): Promise<{ firstTime: boolean; order: Doc | null }> {
  const d1 = await rawD1()
  const now = new Date().toISOString()
  const changed = await runChanges(d1, SQL.markPaid, orderId, now)
  const order = await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  if (!order) return { firstTime: false, order }
  if (changed === 0) {
    const status = String(order.status)
    const marker = info.paymentIntentId ?? 'payment'
    const notes = Array.isArray(order.notes) ? (order.notes as OrderNote[]) : []
    if ((status === 'cancelled' || (status === 'refunded' && !order.paidAt)) && !notes.some((n) => n.text.startsWith(ATTENTION + 'Late payment') && n.text.includes(marker))) {
      // Money arrived for an order that was cancelled or refunded in the meantime.
      await flagAttention(engine, orderId, `Late payment (${marker}) arrived after this order was ${status}. Refund the customer or reinstate the order.`)
    } else if (['processing', 'on-hold', 'completed'].includes(status) && order.paidAt && !order.stockAdjusted) {
      // A replay finds stock that an earlier attempt could not update: retry it.
      await takeStock(engine, order, orderId)
    }
    return { firstTime: false, order }
  }

  const { oversold } = await takeStock(engine, order, orderId)

  // Gift cards / store credit applied to this order are taken now (a no-op when already taken before payment).
  try {
    const sv = await consumeStoredValue(engine, order, 'lenient')
    if (!sv.ok) {
      await runChanges(d1, `UPDATE eg_orders SET status = 'on-hold' WHERE id = ?1 AND status = 'processing'`, orderId)
      await flagAttention(engine, orderId, `Stored value shortfall: ${(sv.shortfallCents / 100).toFixed(2)} of gift card or store credit could not be taken (balance changed since checkout). The order is on hold.`)
    }
  } catch (error) {
    await flagAttention(engine, orderId, `Gift card or store credit could not be applied: ${error instanceof Error ? error.message : 'unknown error'}.`)
  }
  // Gift cards bought on this order are created and emailed now.
  try {
    await issueGiftCards(engine, order)
  } catch (error) {
    await flagAttention(engine, orderId, `Gift cards for this order were not issued: ${error instanceof Error ? error.message : 'unknown error'}. A replayed payment will try again.`)
  }

  // Coupon usage: counted now, atomically, never past the limit.
  try {
    if ((await runChanges(d1, SQL.flagCouponApplied, orderId)) > 0) {
      for (const c of (Array.isArray(order.couponLines) ? order.couponLines : []) as { couponId?: number; code?: string }[]) {
        if (!c.couponId) continue
        const ok = await runChanges(d1, SQL.redeemCoupon, c.couponId)
        if (!ok) await addOrderNote(engine, orderId, { type: 'internal', text: `Coupon "${c.code}" reached its usage limit before this payment completed.`, author: 'System' })
      }
    }
  } catch { /* ignore */ }

  const cartId = Number(order.cartId)
  if (cartId) {
    try {
      await runChanges(d1, SQL.cartRecovered, cartId, now)
      await runChanges(d1, SQL.cartPurchased, cartId, now)
    } catch { /* ignore */ }
  }
  if (info.transactionId) {
    await engine.update({ collection: 'transactions', id: info.transactionId, data: { order: orderId, status: 'succeeded' }, overrideAccess: true }).catch((): null => null)
  }
  await addOrderNote(engine, orderId, { type: 'internal', text: `Payment received${info.paymentIntentId ? ` (${info.paymentIntentId})` : ''}.`, author: 'System' })
  const fresh = { ...order, status: oversold ? 'on-hold' : 'processing' }
  await sendOrderEmail(engine, fresh, oversold ? 'onHold' : 'processing')
  await sendAdminNewOrderEmail(engine, fresh)
  return { firstTime: true, order: fresh }
}

/** pending -> failed, only if still pending. */
export async function markOrderFailed(engine: Engine, orderId: number): Promise<void> {
  const d1 = await rawD1()
  const n = await runChanges(d1, `UPDATE eg_orders SET status = 'failed' WHERE id = ?1 AND status = 'pending'`, orderId)
  if (n > 0) {
    const order = await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
    if (order) await sendOrderEmail(engine, { ...order, status: 'failed' }, 'failed')
  }
}
