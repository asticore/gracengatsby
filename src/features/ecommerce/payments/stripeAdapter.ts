/**
 * From-scratch Stripe payment adapter functions (Stage 10 Ecommerce, Layer 3
 * - see the plan doc). Reproduced from the real ecommerce
 * plugin's `payments/adapters/stripe/{initiatePayment,confirmOrder}.js`
 * (`the vendor package@3.88.0`, read directly from `node_modules`
 * to confirm the exact request/response shapes and Stripe API calls below),
 * simplified for this app's single-currency (AUD-only), no-variants shop
 * config (`engage.config.ts`'s `variants: false`) - the same simplification
 * `../hooks/cartHooks.ts` already established for subtotal recalculation
 * (`product.priceInAUD` directly, no per-currency `priceIn${currency}`
 * lookup, no variant matching/inventory).
 *
 * SCOPE NOTE, important: this reproduces the CART CHECKOUT payment flow
 * (`POST /api/payments/stripe/initiate` and `/confirm-order`) - the real
 * `confirmOrder.js` reproduced below polls `stripe.paymentIntents.retrieve`
 * directly rather than waiting on a webhook, exactly like this module does,
 * so this app's own cart checkout never needed one. `POST
 * /api/payments/stripe/webhooks` was for a long time DELIBERATELY left to
 * the reference engine's own `stripeAdapter()` registration (`engage.config.ts`'s
 * `payments.paymentMethods`) purely to serve the UNRELATED
 * membership-subscription flow (`src/features/members/webhooks.ts`'s
 * `membershipWebhooks`: `checkout.session.completed`, subscription
 * lifecycle events) - intercepting it without reproducing that dispatch
 * first would have silently broken membership billing the exact way Layer 1
 * once silently broke guest carts (see the plan doc's incident log).
 *
 * That dispatch is now reproduced too - `handlePaymentsStripeWebhooks` in
 * `src/localapi/rest.ts` verifies the Stripe signature and calls
 * `membershipWebhooks[event.type]` itself, exactly matching the real
 * plugin's own `payments/adapters/stripe/endpoints/webhooks.js` (read
 * directly from `node_modules` to confirm: `returnStatus` starts at 200,
 * only a signature-verification failure sets it to 400, and the handler is
 * only ever invoked when both `webhookSecret` and `secretKey` are
 * configured). This closes the last real blocker to removing the real
 * `shopPlugin()` call for good - see the plan doc's "What's left" section
 * for what (if anything) still remains.
 *
 * Uses the real Stripe Node SDK directly (`stripe`, already a direct
 * dependency in `package.json` - the real ecommerce plugin's own adapter
 * uses the same package) rather than going through
 * `the vendor package`'s adapter factory - `STRIPE_SECRET_KEY` is
 * read from the same env var `engage.config.ts` already configures the real
 * (still-registered) `stripeAdapter()` from, so both can run side by side
 * against the same Stripe account until the real plugin cutover.
 */

import Stripe from 'stripe'

import type { Engine } from '@/localapi/engine'

import { CheckoutError, priceCart, shopCurrency, validateCheckoutValues, type PricingEngine } from '../server/pricing'
import { loadPaymentSettings, methodTypesFor, resolveStripeSecret, stripeShipping } from './config'
import { cardAmountOf } from '../lib/storedValueOrder'
import { flagMismatch, markOrderPaid } from '../server/orders'
import { consumeStoredValue, quoteStoredValue } from '../server/storedValue'

// The real plugin's own `initiatePayment.js`/`confirmOrder.js` each hardcode
// a DIFFERENT default apiVersion ('2025-06-30.preview' vs
// '2025-03-31.basil') - confirmed by reading both directly, an apparent
// inconsistency in the real plugin's own source rather than something
// meaningful to reproduce. Consolidated to one version here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Stripe's own apiVersion type only accepts its single current literal; casting matches the real plugin's own `@ts-ignore` on this exact line.
const STRIPE_API_VERSION = '2025-03-31.basil' as any

export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: 'Gracengatsby Shop', url: 'https://github.com/asticore/gracengatsby' },
  })
}

export type PaymentsCartItem = { product?: number | { id: number } | null; quantity?: number }
export type PaymentsCartDoc = { id: number; items?: PaymentsCartItem[]; subtotal?: number; currency?: string }

function cartItemProductId(item: PaymentsCartItem): number | null {
  if (item.product && typeof item.product === 'object') return item.product.id
  return typeof item.product === 'number' ? item.product : null
}

export type InitiateStripePaymentArgs = {
  engine: Engine
  cart: PaymentsCartDoc
  currency: string
  customerEmail: string
  billingAddress: Record<string, unknown> | undefined
  shippingAddress: Record<string, unknown> | undefined
  user: { id: number } | null | undefined
  /** Raw checkout body: `couponCode`, `shippingOptionId`, `checkoutFields`. Only ids and text; never totals. */
  checkout?: Record<string, unknown>
}

export type InitiateStripePaymentResult = {
  clientSecret: string
  message: string
  paymentIntentID: string
  /** True when gift cards and store credit covered the whole order: no card payment is needed and the order is already paid. */
  paidInFull?: boolean
  orderID?: number
}

const ADDRESS_KEYS = ['title', 'firstName', 'lastName', 'company', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'phone']

function cleanAddress(a: Record<string, unknown> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of ADDRESS_KEYS) if (typeof a?.[k] === 'string') out[k] = (a[k] as string).trim().slice(0, 200)
  return out
}

/**
 * The priced order both card methods save as `pending`: server-side prices, coupon, shipping, tax, gift cards and
 * store credit. `amount` is what the card (Stripe or PayPal) must pay, the total less stored value.
 */
export type OrderDraft = {
  orderData: Record<string, unknown>
  amount: number
  totalCents: number
  /** Lower case, as Stripe wants it. PayPal callers upper-case it. */
  currency: string
  address: Record<string, string>
  email: string
}

export async function buildOrderDraft(args: InitiateStripePaymentArgs): Promise<OrderDraft> {
  const { engine, cart, customerEmail, shippingAddress, user } = args
  if (!cart.items || cart.items.length === 0) throw new Error('Cart is empty or not provided.')
  if (!customerEmail || typeof customerEmail !== 'string') throw new Error('A valid customer email is required to make a purchase.')
  const checkout = args.checkout ?? {}

  const address = cleanAddress(shippingAddress)
  const priced = await priceCart(
    engine as unknown as PricingEngine,
    {
      items: cart.items as never,
      address: { country: address.country, state: address.state, postalCode: address.postalCode },
      email: customerEmail,
      couponCode: typeof checkout.couponCode === 'string' ? checkout.couponCode : null,
      shippingOptionId: typeof checkout.shippingOptionId === 'string' ? checkout.shippingOptionId : null,
      strict: true,
      cartId: cart.id,
    },
  )
  const { totals, config, lines } = priced
  const currency = shopCurrency(config).toLowerCase() // single-currency shop: whatever the caller passed is ignored
  const fields = validateCheckoutValues(config.fields, (checkout.checkoutFields ?? {}) as Record<string, unknown>)
  if (fields.ok === false || !('values' in fields)) throw new CheckoutError(Object.values((fields as unknown as { errors: Record<string, string> }).errors)[0] ?? 'Check the highlighted fields.')
  const totalCents = totals.totalCents
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new CheckoutError('A valid amount is required to initiate a payment.')

  // Gift cards and store credit: the browser sends only the typed codes and a yes/no for credit.
  const giftCodes = Array.isArray(checkout.giftCardCodes) ? (checkout.giftCardCodes as unknown[]) : []
  const stored = await quoteStoredValue(engine as never, {
    codes: giftCodes,
    useCredit: checkout.useStoreCredit === true,
    userId: user?.id ?? null,
    totalCents,
    lines: totals.lines.map((l) => ({ productId: l.productId, netCents: l.lineCents - l.discountCents, isGiftCard: Boolean(l.isGiftCard) })),
    currency: currency.toUpperCase(),
  })
  if (giftCodes.length > 0 && stored.errors.length > 0) throw new CheckoutError('That gift card cannot be used.')
  const amount = stored.plan.payableCents // what the card pays

  // Fields the editor maps onto the address / the order note.
  for (const key of ['company', 'phone', 'addressLine2'] as const) if ((fields as { values: Record<string, { value: string }> }).values[key]) address[key] = (fields as { values: Record<string, { value: string }> }).values[key].value
  const customerNote = (fields as { values: Record<string, { value: string }> }).values.orderNotes?.value
  const email = customerEmail.trim().toLowerCase()

  const orderData = {
    items: lines.map((l) => ({ product: Number(l.productId), quantity: l.quantity })),
    lineItems: totals.lines.map((l) => ({
      productId: Number(l.productId),
      variationId: (l as unknown as { variationId?: string | null }).variationId ?? null,
      name: l.name,
      sku: l.sku ?? null,
      quantity: l.quantity,
      unitCents: l.unitCents,
      lineCents: l.lineCents,
      discountCents: l.discountCents,
      taxCents: l.taxCents,
      ...(l.preorder ? { preorder: { releaseDate: l.preorder.releaseDate ?? null, note: l.preorder.note ?? null } } : {}),
      ...(l.isGiftCard ? { isGiftCard: true, giftAmountCents: (l as unknown as { giftAmountCents?: number }).giftAmountCents, recipient: (l as unknown as { recipient?: unknown }).recipient } : {}),
    })),
    shippingAddress: address,
    ...(user ? { customer: user.id } : {}),
    customerEmail: email,
    status: 'pending',
    amount: totalCents,
    giftCardTotal: stored.plan.giftCards.reduce((n, c) => n + c.cents, 0),
    storeCreditTotal: stored.plan.creditCents,
    storedValue: stored.snapshot,
    currency: currency.toUpperCase(),
    subtotal: totals.subtotalCents,
    discountTotal: totals.discountCents,
    shippingTotal: totals.shippingCents,
    taxTotal: totals.taxCents,
    pricesIncludeTax: totals.pricesIncludeTax,
    shippingMethod: totals.shippingOption ? { id: totals.shippingOption.id, title: totals.shippingOption.title, costCents: totals.shippingOption.costCents, type: totals.shippingOption.type } : null,
    taxLines: totals.taxLines,
    couponLines: totals.coupon ? [totals.coupon] : [],
    checkoutFields: (fields as { values: Record<string, { value: string }> }).values,
    customerNote: customerNote ?? null,
    cartId: cart.id,
  }

  return { orderData, amount, totalCents, currency, address, email }
}

/**
 * Prices the cart ON THE SERVER (database prices, coupon, shipping, tax - see
 * ../server/pricing.ts), stores a pending-payment order holding that snapshot,
 * and creates the Stripe PaymentIntent for exactly the order total. The browser
 * supplies only ids, quantities and the chosen shipping option id. A cart that
 * already has a pending order reuses it (and updates its PaymentIntent), so
 * retries do not pile up orders.
 */
export async function initiateStripePayment(args: InitiateStripePaymentArgs): Promise<InitiateStripePaymentResult> {
  const { engine, cart, customerEmail, billingAddress, user } = args
  const { orderData, amount, currency, address, email } = await buildOrderDraft(args)
  if (amount === 0) return payInFullWithStoredValue(engine, cart.id, orderData, email)

  const paySettings = await loadPaymentSettings(engine as never)
  const secretKey = resolveStripeSecret(paySettings)
  if (!secretKey) throw new Error('Stripe secret key is required.')
  const stripe = getStripeClient(secretKey)
  // Pay-later methods (Afterpay, Klarna) are offered only when switched on and the order fits their rules.
  const methodTypes = methodTypesFor(paySettings, amount, address.country, currency)
  const shipping = methodTypes && methodTypes.length > 1 ? stripeShipping(address) : undefined
  let customer = (await stripe.customers.list({ email: customerEmail })).data[0]
  if (!customer?.id) customer = await stripe.customers.create({ email: customerEmail })

  const flattenedCart = cart.items.map((item) => ({ product: cartItemProductId(item), quantity: item.quantity }))

  // Reuse this cart's pending order if there is one.
  const existing = await engine
    .find({ collection: 'orders', where: { cartId: { equals: cart.id }, status: { equals: 'pending' } }, limit: 1, depth: 0, overrideAccess: true })
    .then((r) => (r?.docs?.[0] as { id: number; paymentIntentId?: string } | undefined) ?? undefined)
    .catch((): undefined => undefined)

  let paymentIntent
  let orderId: number
  if (existing?.paymentIntentId) {
    try {
      // Stripe metadata values are capped at 500 characters, so only ids go in (nothing is read back from it).
      paymentIntent = await stripe.paymentIntents.update(existing.paymentIntentId, { amount, ...(methodTypes ? { payment_method_types: methodTypes } : {}), ...(shipping ? { shipping } : {}), metadata: { cartID: String(cart.id), orderID: String(existing.id) } })
    } catch {
      paymentIntent = undefined
    }
  }
  if (paymentIntent && existing) {
    orderId = existing.id
    await engine.update({ collection: 'orders', id: orderId, data: orderData as never, overrideAccess: true })
  } else {
    // The PaymentIntent is created first: if Stripe refuses, no pending order is left behind.
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      ...(methodTypes ? { payment_method_types: methodTypes } : { automatic_payment_methods: { enabled: true } }),
      ...(shipping ? { shipping } : {}),
      currency,
      customer: customer.id,
      metadata: { cartID: String(cart.id) },
    })
    try {
      const order = await engine.create({ collection: 'orders', data: { ...orderData, paymentIntentId: paymentIntent.id } as never, overrideAccess: true })
      orderId = order.id as number
      paymentIntent = await stripe.paymentIntents.update(paymentIntent.id, { metadata: { cartID: String(cart.id), orderID: String(orderId) } })
    } catch (error) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch((): null => null)
      throw error
    }
    await engine.create({
      collection: 'transactions',
      data: {
        ...(user ? { customer: user.id } : { customerEmail }),
        amount: paymentIntent.amount,
        billingAddress: billingAddress ?? null,
        cart: cart.id,
        currency: paymentIntent.currency.toUpperCase(),
        items: flattenedCart,
        order: orderId,
        paymentMethod: 'stripe',
        status: 'pending',
        stripe: { customerID: customer.id, paymentIntentID: paymentIntent.id },
      },
      overrideAccess: true,
    })
  }

  // Remember the email so an abandoned-cart reminder can be sent (see ../server/abandoned.ts).
  await engine.update({ collection: 'carts', id: cart.id, data: { email } as never, overrideAccess: true }).catch((): null => null)

  return {
    clientSecret: paymentIntent!.client_secret || '',
    message: 'Payment initiated successfully',
    paymentIntentID: paymentIntent!.id,
  }
}

export type ConfirmStripeOrderArgs = {
  engine: Engine
  customerEmail: string
  paymentIntentID: string
  user: { id: number } | null | undefined
}

export type ConfirmStripeOrderResult = { message: string; orderID: number; transactionID: number }

/**
 * Confirms with Stripe that the PaymentIntent really succeeded (never trusting
 * the browser), checks the charged amount equals the stored order total, then
 * marks the pending order paid through `markOrderPaid` - the same idempotent
 * path the webhook uses, so a double confirm or a webhook race does stock,
 * coupon usage and emails exactly once.
 */
export async function confirmStripeOrder(args: ConfirmStripeOrderArgs): Promise<ConfirmStripeOrderResult> {
  const { engine, paymentIntentID } = args
  const secretKey = resolveStripeSecret(await loadPaymentSettings(engine as never))
  if (!secretKey) throw new Error('Stripe secret key is required')
  if (!paymentIntentID) throw new Error('PaymentIntent ID is required')
  const stripe = getStripeClient(secretKey)

  const transactionsResult = await engine.find({
    collection: 'transactions',
    where: { stripePaymentIntentID: { equals: paymentIntentID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const transaction = transactionsResult.docs[0] as { id: number } | undefined
  if (!transactionsResult.totalDocs || !transaction) throw new Error('No transaction found for the provided PaymentIntent ID')

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID)
  if (paymentIntent.status !== 'succeeded') throw new Error('Payment not completed.')
  const result = await finalizePaidIntent(engine, paymentIntent, transaction.id)
  return { message: 'Payment initiated successfully', orderID: result.orderId, transactionID: transaction.id }
}

/**
 * Gift cards and store credit cover the whole order, so there is no card step. The order is saved, the stored
 * value is taken in strict mode (a shortfall undoes it and refuses the checkout), and then the order is marked
 * paid through the same idempotent path a card payment uses.
 */
export async function payInFullWithStoredValue(engine: Engine, cartId: number, orderData: Record<string, unknown>, email: string): Promise<InitiateStripePaymentResult> {
  const existing = await engine
    .find({ collection: 'orders', where: { cartId: { equals: cartId }, status: { equals: 'pending' } }, limit: 1, depth: 0, overrideAccess: true })
    .then((r) => (r?.docs?.[0] as { id: number; paymentIntentId?: string } | undefined) ?? undefined)
    .catch((): undefined => undefined)
  const data = { ...orderData, paymentIntentId: null as string | null, ...(existing ? { storedValueApplied: false } : {}) }
  let orderId: number
  if (existing) {
    orderId = existing.id
    await engine.update({ collection: 'orders', id: orderId, data: data as never, overrideAccess: true })
    const key = existing.paymentIntentId ? resolveStripeSecret(await loadPaymentSettings(engine as never)) : null
    if (existing.paymentIntentId && key) await getStripeClient(key).paymentIntents.cancel(existing.paymentIntentId).catch((): null => null)
  } else {
    orderId = (await engine.create({ collection: 'orders', data: data as never, overrideAccess: true })).id as number
  }
  const order = await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const taken = await consumeStoredValue(engine as never, order as never, 'strict')
  if (!taken.ok) throw new CheckoutError('A gift card or store credit balance changed. Please review your order and try again.')
  await markOrderPaid(engine as never, orderId, {})
  await engine.update({ collection: 'carts', id: cartId, data: { email } as never, overrideAccess: true }).catch((): null => null)
  return { clientSecret: '', message: 'Order paid with gift card and store credit', paymentIntentID: '', paidInFull: true, orderID: orderId }
}

/** Shared by confirm and the `payment_intent.succeeded` webhook. */
export async function finalizePaidIntent(engine: Engine, paymentIntent: Stripe.PaymentIntent, transactionId?: number): Promise<{ orderId: number; firstTime: boolean }> {
  const orderId = Number(paymentIntent.metadata?.orderID)
  if (!orderId) throw new Error('Order ID not found in the PaymentIntent metadata')
  const order = (await engine.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })) as { amount?: number; giftCardTotal?: number; storeCreditTotal?: number } | null
  if (!order) throw new Error('Order not found')
  // The card pays the total less any gift card / store credit applied to the order.
  const expected = cardAmountOf(order)
  if (typeof order.amount === 'number' && expected !== paymentIntent.amount_received && expected !== paymentIntent.amount) {
    // Never 500 forever (Stripe would retry the webhook for days): record it for staff and acknowledge.
    await flagMismatch(engine as never, orderId, `Payment ${paymentIntent.id} of ${paymentIntent.amount_received ?? paymentIntent.amount} cents does not match the amount due by card of ${expected} cents.`)
    return { orderId, firstTime: false }
  }
  const { firstTime } = await markOrderPaid(engine as never, orderId, { paymentIntentId: paymentIntent.id, transactionId })
  return { orderId, firstTime }
}
