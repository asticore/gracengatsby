import { validateRefund } from '../lib/orderStatus'
import { rawD1, runChanges, SQL } from './db'
import { sendOrderEmail } from './emails'
import { addOrderNote, restockedSoFar, restockOrder } from './orders'

type Doc = Record<string, unknown>
type Req = { engine: { findByID: (a: unknown) => Promise<Doc | null>; update: (a: unknown) => Promise<Doc>; find: (a: unknown) => Promise<{ docs: Doc[] }>; findGlobal: (a: unknown) => Promise<Doc> }; user?: { id?: number; email?: string } | null }
const orderIdOf = (v: unknown) => (typeof v === 'object' && v ? Number((v as { id: number }).id) : Number(v))

async function stripeRefund(paymentIntentId: string, amount: number, orderId: number): Promise<string> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Card refunds are not available (Stripe is not configured). Use the manual method to record a refund made elsewhere.')
  const { getStripeClient } = await import('../payments/stripeAdapter')
  const refund = await getStripeClient(key).refunds.create({ payment_intent: paymentIntentId, amount, metadata: { orderId: String(orderId) } })
  return refund.id
}

/**
 * Runs before a refund row is saved. Reserves the amount on the order with an
 * atomic conditional UPDATE (so concurrent refunds can never exceed the paid
 * total), then calls the payment provider; if the provider fails the
 * reservation is released and the save is refused.
 */
export async function runRefundBeforeChange({ data, operation, req }: { data: Doc; operation: string; req: Req }) {
  if (operation !== 'create') throw new Error('Refunds cannot be edited.')
  const orderId = orderIdOf(data.order)
  const order = await req.engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  if (!order) throw new Error('Order not found.')
  const check = validateRefund(order as never, data.amount)
  if (!check.ok) throw new Error((check as { error: string }).error)
  const amount = data.amount as number
  const d1 = await rawD1()
  if ((await runChanges(d1, SQL.reserveRefund, orderId, amount)) === 0) throw new Error('The refund exceeds what is left to refund on this order.')
  let providerId: string | undefined
  try {
    if (data.method !== 'manual' && order.paymentIntentId) providerId = await stripeRefund(String(order.paymentIntentId), amount, orderId)
    else if (data.method !== 'manual' && !order.paymentIntentId) data.method = 'manual'
  } catch (error) {
    await runChanges(d1, SQL.releaseRefund, orderId, amount)
    throw error instanceof Error ? error : new Error('The refund failed.')
  }
  // Restock quantities are saved on the refund row, bounded per line by what was sold minus what earlier
  // refunds already put back, and only when this order's stock was actually taken.
  if (data.restock) {
    const lines = (Array.isArray(order.lineItems) ? order.lineItems : []) as { quantity?: number }[]
    const done = await restockedSoFar(req.engine as never, orderId)
    const merged = new Map<number, number>()
    for (const r of (Array.isArray(data.items) ? data.items : []) as { index?: number; quantity?: number }[]) {
      if (!Number.isInteger(r.index) || (r.index as number) < 0 || (r.index as number) >= lines.length) continue
      if (!Number.isInteger(r.quantity) || (r.quantity as number) <= 0) continue
      merged.set(r.index as number, (merged.get(r.index as number) ?? 0) + (r.quantity as number))
    }
    const bounded: { index: number; quantity: number }[] = []
    if (order.stockAdjusted) {
      for (const [index, quantity] of merged) {
        const room = Math.max(0, (lines[index].quantity ?? 0) - (done.get(index) ?? 0))
        if (Math.min(quantity, room) > 0) bounded.push({ index, quantity: Math.min(quantity, room) })
      }
    }
    data.items = bounded
  }
  data.status = 'completed'
  if (providerId) data.providerRefundId = providerId
  if (req.user?.id) data.createdBy = req.user.id
  return data
}

/** After the refund row exists: set the refunded status when fully refunded, restock, note and email. */
export async function runRefundAfterChange({ doc, operation, req }: { doc: Doc; operation: string; req: Req }) {
  if (operation !== 'create') return doc
  const orderId = orderIdOf(doc.order)
  const order = await req.engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  if (!order) return doc
  const amount = doc.amount as number
  const money = `$${(amount / 100).toFixed(2)}`
  try {
    const full = (order.refundedTotal as number) >= (order.amount as number)
    if (full && order.status !== 'refunded') await runChanges(await rawD1(), `UPDATE eg_orders SET status = 'refunded' WHERE id = ?1 AND status IN ('processing','on-hold','completed')`, orderId)
    if (doc.restock) {
      const only = new Map<number, number>()
      for (const r of (Array.isArray(doc.items) ? doc.items : []) as { index?: number; quantity?: number }[]) {
        if (Number.isInteger(r.index) && (r.quantity ?? 0) > 0) only.set(r.index as number, r.quantity as number)
      }
      if (only.size > 0) await restockOrder(req.engine as never, order, 'refund', only)
    }
    await addOrderNote(req.engine as never, orderId, { type: 'internal', text: `Refund of ${money} recorded${doc.reason ? `: ${doc.reason}` : ''} (${doc.providerRefundId ? 'card refund ' + doc.providerRefundId : 'manual'}).`, author: req.user?.email ?? 'Admin' })
    await sendOrderEmail(req.engine as never, { ...order, status: 'refunded' }, 'refunded', `Refund: ${money}${doc.reason ? ` - ${doc.reason}` : ''}`)
  } catch {
    /* the refund itself is already recorded */
  }
  return doc
}
