import { addOrderNote } from '../server/orders'
import { idOfRelation, type SubEngine, type SubscriptionRecord } from './records'

/**
 * The order for one paid subscription invoice (the first payment or a renewal). Written straight to
 * the orders collection as already paid, so the customer's account shows it under Orders, with an
 * invoice number. Stock is not taken and no order email is sent: the subscription emails say it
 * instead. Products are not shipped again by a renewal, so shipping is not charged either.
 */

export type InvoiceLike = {
  id: string
  amount_paid: number
  currency: string
  billing_reason?: string | null
  lines?: { data: Array<{ description?: string | null; amount: number }> }
}

export async function createRenewalOrder(engine: SubEngine, rec: SubscriptionRecord, invoice: InvoiceLike, now: string): Promise<number> {
  const productId = idOfRelation(rec.product)
  const customerId = idOfRelation(rec.customer)
  const name = rec.productName || 'Subscription'
  const lines = (invoice.lines?.data ?? [])
    .filter((line) => line.amount > 0)
    .map((line) => ({
      productId,
      variationId: null as string | null,
      name: line.description || name,
      sku: null as string | null,
      quantity: 1,
      unitCents: line.amount,
      lineCents: line.amount,
      discountCents: 0,
      taxCents: 0,
    }))
  const order = (await engine.create({
    collection: 'orders',
    data: {
      items: productId ? [{ product: productId, quantity: 1 }] : [],
      lineItems: lines,
      ...(customerId ? { customer: customerId } : {}),
      customerEmail: rec.customerEmail ?? undefined,
      status: 'processing',
      paidAt: now,
      amount: invoice.amount_paid,
      subtotal: invoice.amount_paid,
      discountTotal: 0,
      shippingTotal: 0,
      taxTotal: 0,
      currency: (invoice.currency || 'aud').toUpperCase(),
      customerNote: `Subscription payment for ${name}.`,
      taxLines: [],
      couponLines: [],
    },
    overrideAccess: true,
  })) as { id: number }

  // Invoice numbering and the internal note are bookkeeping: a failure here must not lose the order.
  try {
    const { rawD1 } = await import('../server/db')
    const { ensureInvoiceNumber } = await import('../numbering')
    await ensureInvoiceNumber(await rawD1(), order.id)
  } catch {
    /* the invoice is numbered when it is first opened */
  }
  await addOrderNote(engine as never, order.id, { type: 'internal', text: `Subscription payment received (Stripe invoice ${invoice.id}).`, author: 'System' }).catch((): null => null)
  return order.id
}
