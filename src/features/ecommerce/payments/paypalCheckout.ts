/**
 * PayPal cart checkout (server only). Same shape as the Stripe path in ./stripeAdapter.ts:
 *  - create: the server prices the cart (buildOrderDraft), saves a pending order, then asks PayPal for an order
 *    for exactly the amount still due by card. The browser only ever sends ids, codes and the shipping choice.
 *  - capture: PayPal captures what the buyer approved; the captured amount and currency must equal the order
 *    (never trusting the browser), then the order is marked paid by markOrderPaid, the same path Stripe uses.
 */

import type { Engine } from '@/localapi/engine'

import { CheckoutError } from '../server/pricing'
import { cardAmountOf } from '../lib/storedValueOrder'
import { flagMismatch, markOrderPaid } from '../server/orders'
import { loadPaymentSettings, resolveStripeSecret } from './config'
import { buildOrderDraft, getStripeClient, payInFullWithStoredValue, type InitiateStripePaymentArgs, type InitiateStripePaymentResult } from './stripeAdapter'
import { createPayPalAdapter, PayPalError, type PayPalAdapter, type PayPalCapture, type PayPalOptions } from './paypalAdapter'

type Doc = Record<string, unknown>
type Db = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findByID: (a: unknown) => Promise<Doc | null>
  update: (a: unknown) => Promise<Doc>
  create: (a: unknown) => Promise<Doc>
}

export type PayPalOrderRow = {
  id: number
  amount?: number | null
  currency?: string | null
  giftCardTotal?: number | null
  storeCreditTotal?: number | null
  status?: string | null
  paidAt?: string | null
  paypalCaptureId?: string | null
}

/** Where a PayPal payment went wrong, for the browser: a status code and one plain sentence. */
export type PayPalSettleResult = { ok: true; alreadyPaid: boolean } | { ok: false; status: number; message: string }

export type SettleDeps = {
  /** Captures on PayPal (or reads the capture back when PayPal already captured it). */
  capture: () => Promise<PayPalCapture>
  /** Saves the capture id on the order before the order is marked paid, so a retry can finish the job. */
  saveCaptureId: (captureId: string) => Promise<void>
  /** Marks the order paid through markOrderPaid (idempotent). */
  markPaid: (captureId: string) => Promise<void>
  /** Holds the order and tells staff. Called when PayPal took a different amount or currency. */
  flagMismatch: (text: string) => Promise<void>
}

/**
 * Decides what a capture means for an order. Pure apart from the injected side effects, so the rules can be
 * tested without a database. A capture that was already settled is answered without asking PayPal again.
 */
export async function settlePayPalCapture(order: PayPalOrderRow, deps: SettleDeps): Promise<PayPalSettleResult> {
  if (order.paypalCaptureId && order.paidAt) {
    // Settled before: finish the side effects again (a no-op when they already ran) and say so.
    await deps.markPaid(order.paypalCaptureId)
    return { ok: true, alreadyPaid: true }
  }
  if (order.paypalCaptureId && order.status === 'on-hold') {
    return { ok: false, status: 409, message: 'This payment is already being reviewed by the shop. We will be in touch.' }
  }

  const expected = cardAmountOf(order)
  const currency = String(order.currency ?? 'AUD').toUpperCase()
  let capture: PayPalCapture
  try {
    capture = await deps.capture()
  } catch (error) {
    if (error instanceof PayPalError) return { ok: false, status: 402, message: 'PayPal could not take this payment. Please try again or choose another payment method.' }
    throw error
  }
  if (!capture.captureId || capture.captureStatus !== 'COMPLETED') {
    return { ok: false, status: 409, message: 'PayPal has not finished taking this payment yet. Please check your PayPal account before trying again.' }
  }

  if (capture.amountCents !== expected || (capture.currency ?? '').toUpperCase() !== currency) {
    // The money has moved, so keep the capture id on the order for staff, hold it, and refuse to mark it paid.
    await deps.saveCaptureId(capture.captureId)
    await deps.flagMismatch(
      `PayPal capture ${capture.captureId} took ${capture.amountCents ?? 'an unknown amount'} ${capture.currency ?? ''} (cents) but the order is ${expected} ${currency} (cents) by card. Check it in PayPal and refund or reinstate the order.`,
    )
    return { ok: false, status: 400, message: 'The payment amount did not match this order. The shop has been alerted and will be in touch.' }
  }

  await deps.saveCaptureId(capture.captureId)
  await deps.markPaid(capture.captureId)
  return { ok: true, alreadyPaid: false }
}

/** Creates the PayPal order and the shop's pending order for it. Returns the PayPal order id for the buyer's popup. */
export async function createPayPalCheckout(
  engine: Engine,
  args: InitiateStripePaymentArgs,
  options: PayPalOptions = {},
): Promise<{ paypalOrderId: string; orderID?: number; paidInFull?: boolean; message: string }> {
  const db = engine as unknown as Db
  const { cart, billingAddress, user } = args
  const draft = await buildOrderDraft(args)
  const { orderData, amount, currency, email } = draft
  if (amount === 0) {
    // Gift cards and store credit cover it: no PayPal step at all.
    const paid: InitiateStripePaymentResult = await payInFullWithStoredValue(engine, cart.id, orderData, email)
    return { paypalOrderId: '', orderID: paid.orderID, paidInFull: true, message: paid.message }
  }

  const settings = await loadPaymentSettings(engine as never)
  const paypal = settings.paypal
  if (!paypal?.enabled || !paypal.clientId || !paypal.clientSecret) throw new CheckoutError('PayPal is not available right now.')
  const adapter: PayPalAdapter = createPayPalAdapter({ clientId: paypal.clientId, clientSecret: paypal.clientSecret, environment: paypal.environment }, options)
  const created = await adapter.createOrder(amount, currency.toUpperCase(), `cart-${cart.id}`)

  const existing = await db
    .find({ collection: 'orders', where: { cartId: { equals: cart.id }, status: { equals: 'pending' } }, limit: 1, depth: 0, overrideAccess: true })
    .then((r) => (r?.docs?.[0] as { id: number; paymentIntentId?: string | null } | undefined) ?? undefined)
    .catch((): undefined => undefined)

  let orderId: number
  if (existing) {
    // A card intent left on this pending order must not be paid as well: cancel it (best effort) and reuse the order.
    if (existing.paymentIntentId) {
      const secret = resolveStripeSecret(settings)
      if (secret) await getStripeClient(secret).paymentIntents.cancel(existing.paymentIntentId).catch((): null => null)
    }
    orderId = existing.id
    await db.update({ collection: 'orders', id: orderId, data: { ...orderData, paypalOrderId: created.id, paypalCaptureId: null, paymentIntentId: null }, overrideAccess: true })
  } else {
    const order = await db.create({ collection: 'orders', data: { ...orderData, paypalOrderId: created.id }, overrideAccess: true })
    orderId = Number(order.id)
    await db.create({
      collection: 'transactions',
      data: {
        ...(user ? { customer: user.id } : { customerEmail: email }),
        amount,
        billingAddress: billingAddress ?? null,
        cart: cart.id,
        currency: currency.toUpperCase(),
        items: orderData.items,
        order: orderId,
        paymentMethod: 'paypal',
        status: 'pending',
      },
      overrideAccess: true,
    })
  }
  await db.update({ collection: 'carts', id: cart.id, data: { email }, overrideAccess: true }).catch((): null => null)
  return { paypalOrderId: created.id, orderID: orderId, message: 'PayPal order created' }
}

/**
 * Settles one order against a capture: finds the transaction, then saves the capture id, marks the order paid or
 * holds it (settlePayPalCapture). Shared by the buyer's capture and the PayPal webhook, so both follow the same rules.
 */
export async function settleOrderCapture(engine: Engine, order: PayPalOrderRow & { id: number }, capture: () => Promise<PayPalCapture>): Promise<PayPalCaptureOutcome> {
  const db = engine as unknown as Db
  const txn = await db.find({ collection: 'transactions', where: { order: { equals: order.id }, paymentMethod: { equals: 'paypal' } }, limit: 1, depth: 0, overrideAccess: true })
  const transactionId = txn.docs[0]?.id as number | undefined

  const result = await settlePayPalCapture(order, {
    capture,
    saveCaptureId: async (captureId) => {
      await db.update({ collection: 'orders', id: order.id, data: { paypalCaptureId: captureId }, overrideAccess: true })
    },
    markPaid: async (captureId) => {
      await markOrderPaid(engine as never, order.id, { paymentIntentId: captureId, transactionId })
    },
    flagMismatch: (text) => flagMismatch(engine as never, order.id, text),
  })
  // `=== false` narrows here; a bare `!result.ok` does not, because this project runs with strictNullChecks off.
  if (result.ok === false) return { ok: false, status: result.status, message: result.message }
  return { ok: true, alreadyPaid: result.alreadyPaid, orderId: order.id, transactionId }
}

/** Captures the approved PayPal order for this cart and settles the shop order. Ids come from the browser; amounts never do. */
export type PayPalCaptureOutcome = { ok: true; alreadyPaid: boolean; orderId: number; transactionId?: number } | { ok: false; status: number; message: string }

export async function capturePayPalCheckout(engine: Engine, args: { cartId: number; paypalOrderId: string }, options: PayPalOptions = {}): Promise<PayPalCaptureOutcome> {
  const db = engine as unknown as Db
  const found = await db.find({ collection: 'orders', where: { paypalOrderId: { equals: args.paypalOrderId }, cartId: { equals: args.cartId } }, limit: 1, depth: 0, overrideAccess: true })
  const order = found.docs[0] as (PayPalOrderRow & { id: number }) | undefined
  if (!order) return { ok: false, status: 404, message: 'Order not found.' }

  const settings = await loadPaymentSettings(engine as never)
  const paypal = settings.paypal
  if (!paypal?.clientId || !paypal.clientSecret) return { ok: false, status: 503, message: 'PayPal is not available right now.' }
  const adapter = createPayPalAdapter({ clientId: paypal.clientId, clientSecret: paypal.clientSecret, environment: paypal.environment }, options)
  return settleOrderCapture(engine, order, () => adapter.captureOrder(args.paypalOrderId))
}
