/**
 * From-scratch Stripe payment adapter functions (Stage 10 Ecommerce, Layer 3
 * - see payload-removal-plan.md). Reproduced from the real ecommerce
 * plugin's `payments/adapters/stripe/{initiatePayment,confirmOrder}.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`, read directly from `node_modules`
 * to confirm the exact request/response shapes and Stripe API calls below),
 * simplified for this app's single-currency (AUD-only), no-variants shop
 * config (`engage.config.ts`'s `variants: false`) - the same simplification
 * `../hooks/cartHooks.ts` already established for subtotal recalculation
 * (`product.priceInAUD` directly, no per-currency `priceIn${currency}`
 * lookup, no variant matching/inventory).
 *
 * SCOPE NOTE, important: this reproduces the CART CHECKOUT payment flow only
 * (`POST /api/payments/stripe/initiate` and `/confirm-order`, wired in
 * `src/localapi/rest.ts`'s dispatcher). `POST /api/payments/stripe/webhooks`
 * is DELIBERATELY left alone, still served by real Payload's own,
 * still-registered `stripeAdapter()` (`src/engine/commerce/stripe.ts` /
 * `engage.config.ts`'s `payments.paymentMethods`) - that route today only
 * wires up the UNRELATED membership-subscription flow
 * (`src/features/members/webhooks.ts`'s `membershipWebhooks`:
 * `checkout.session.completed`, subscription lifecycle events), which this
 * app's own cart checkout does not use at all: the real `confirmOrder.js`
 * reproduced below polls `stripe.paymentIntents.retrieve` directly rather
 * than waiting on a webhook, exactly like this module does. Intercepting
 * `/webhooks` here would silently break membership billing the exact way
 * Layer 1 silently broke guest carts (see the plan doc's incident log) -
 * `src/localapi/rest.ts`'s dispatcher only ever claims `initiate` and
 * `confirm-order` under `/payments/stripe/`, never `webhooks`.
 *
 * Uses the real Stripe Node SDK directly (`stripe`, already a direct
 * dependency in `package.json` - the real ecommerce plugin's own adapter
 * uses the same package) rather than going through
 * `@payloadcms/plugin-ecommerce`'s adapter factory - `STRIPE_SECRET_KEY` is
 * read from the same env var `engage.config.ts` already configures the real
 * (still-registered) `stripeAdapter()` from, so both can run side by side
 * against the same Stripe account until the real plugin cutover.
 */

import Stripe from 'stripe'

import type { Engine } from '@/localapi/engine'

// The real plugin's own `initiatePayment.js`/`confirmOrder.js` each hardcode
// a DIFFERENT default apiVersion ('2025-06-30.preview' vs
// '2025-03-31.basil') - confirmed by reading both directly, an apparent
// inconsistency in the real plugin's own source rather than something
// meaningful to reproduce. Consolidated to one version here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Stripe's own apiVersion type only accepts its single current literal; casting matches the real plugin's own `@ts-ignore` on this exact line.
const STRIPE_API_VERSION = '2025-03-31.basil' as any

function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: 'Gracengatsby Shop', url: 'https://payloadcms.com' },
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
}

export type InitiateStripePaymentResult = { clientSecret: string; message: string; paymentIntentID: string }

/**
 * Reproduced from the real plugin's `initiatePayment.js` (the ADAPTER half -
 * cart/currency/product-price/inventory validation is the caller's job,
 * `handlePaymentsStripeInitiate` in `src/localapi/rest.ts`, matching the
 * real plugin's own split between `endpoints/initiatePayment.js` and this
 * file). Creates or reuses a Stripe Customer by email, creates a
 * PaymentIntent for the cart's subtotal, and records a `transactions` row
 * (`status: 'pending'`) - `overrideAccess: true` on that create matches real
 * Payload's own Local API default (`payload.create()` with no
 * `overrideAccess` defaults to `true` there, confirmed against
 * `payload/dist/collections/operations/local/create.js`; this app's own
 * `engine.create()` defaults the OPPOSITE way - `false` - so it must be
 * passed explicitly to match).
 */
export async function initiateStripePayment(args: InitiateStripePaymentArgs): Promise<InitiateStripePaymentResult> {
  const { engine, cart, currency, customerEmail, billingAddress, shippingAddress, user } = args
  const secretKey = process.env.STRIPE_SECRET_KEY
  const amount = cart.subtotal

  if (!secretKey) throw new Error('Stripe secret key is required.')
  if (!currency) throw new Error('Currency is required.')
  if (!cart.items || cart.items.length === 0) throw new Error('Cart is empty or not provided.')
  if (!customerEmail || typeof customerEmail !== 'string') throw new Error('A valid customer email is required to make a purchase.')
  if (!amount || typeof amount !== 'number' || amount <= 0) throw new Error('A valid amount is required to initiate a payment.')

  const stripe = getStripeClient(secretKey)

  let customer = (await stripe.customers.list({ email: customerEmail })).data[0]
  if (!customer?.id) {
    customer = await stripe.customers.create({ email: customerEmail })
  }

  // No `variant`/custom item fields to preserve (this app's cart items are
  // just `{product, quantity}` - `../collections/shared.ts`'s
  // `cartItemFields`), so the flattening real `initiatePayment.js` does is
  // just this.
  const flattenedCart = cart.items.map((item) => ({ product: cartItemProductId(item), quantity: item.quantity }))

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    automatic_payment_methods: { enabled: true },
    currency,
    customer: customer.id,
    metadata: {
      cartID: String(cart.id),
      cartItemsSnapshot: JSON.stringify(flattenedCart),
      shippingAddress: JSON.stringify(shippingAddress ?? null),
    },
  })

  await engine.create({
    collection: 'transactions',
    data: {
      ...(user ? { customer: user.id } : { customerEmail }),
      amount: paymentIntent.amount,
      billingAddress: billingAddress ?? null,
      cart: cart.id,
      currency: paymentIntent.currency.toUpperCase(),
      items: flattenedCart,
      paymentMethod: 'stripe',
      status: 'pending',
      stripe: { customerID: customer.id, paymentIntentID: paymentIntent.id },
    },
    overrideAccess: true,
  })

  return {
    clientSecret: paymentIntent.client_secret || '',
    message: 'Payment initiated successfully',
    paymentIntentID: paymentIntent.id,
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
 * Reproduced from the real plugin's `confirmOrder.js`. Looks the pending
 * transaction up by its stored PaymentIntent id, confirms with Stripe that
 * the PaymentIntent actually succeeded (never trusts the client's own
 * report - see this project's `membershipWebhooks`' header comment for the
 * same principle applied to the subscription side), creates the `orders`
 * row from the cart-items snapshot stashed in the PaymentIntent's metadata,
 * marks the cart purchased and the transaction succeeded, then decrements
 * product inventory.
 *
 * The `where` clause below queries `stripePaymentIntentID`, NOT the real
 * plugin's dotted `'stripe.paymentIntentID'` - confirmed by reading
 * `src/cms/db/schema/generate.ts`'s `processGroupField` directly: a group
 * field's subfields are flattened onto the parent table under a
 * `<groupName><CapitalizedSubfieldName>` JS key (`stripe.paymentIntentID` ->
 * column key `stripePaymentIntentID`), and `src/cms/db/where.ts`'s
 * `buildWhere` looks a `where` key up in that same flat `columns` map
 * verbatim - there is no dotted-path resolution in this app's own query
 * engine the way real Payload's does. The nested `transaction.stripe.*`
 * shape is only reconstructed on READ (by `nestGroups`), never accepted on
 * the `where` side.
 *
 * Inventory decrement: real Payload does this via a raw
 * `payload.db.updateOne` (`endpoints/confirmOrder.js`) that writes straight
 * to the live table, bypassing hooks/access/versions entirely - this
 * engine has no such bypass, so `engine.update(..., overrideAccess: true,
 * draft: false)` is used instead. Documented simplification, not a
 * functional gap: `products` has `versions: {drafts: true}` (Products.ts),
 * so this technically also writes a version-snapshot row real Payload's raw
 * DB write wouldn't - the live inventory value this engine's own read path
 * serves ends up correct either way, which is what actually matters for the
 * storefront.
 */
export async function confirmStripeOrder(args: ConfirmStripeOrderArgs): Promise<ConfirmStripeOrderResult> {
  const { engine, customerEmail, paymentIntentID, user } = args
  const secretKey = process.env.STRIPE_SECRET_KEY
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
  const transaction = transactionsResult.docs[0] as { id: number; items?: PaymentsCartItem[] } | undefined
  if (!transactionsResult.totalDocs || !transaction) throw new Error('No transaction found for the provided PaymentIntent ID')

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentID)
  if (paymentIntent.status !== 'succeeded') throw new Error('Payment not completed.')

  const cartID = paymentIntent.metadata.cartID
  const cartItemsSnapshot = paymentIntent.metadata.cartItemsSnapshot
    ? (JSON.parse(paymentIntent.metadata.cartItemsSnapshot) as PaymentsCartItem[])
    : undefined
  const shippingAddress = paymentIntent.metadata.shippingAddress ? JSON.parse(paymentIntent.metadata.shippingAddress) : undefined
  if (!cartID) throw new Error('Cart ID not found in the PaymentIntent metadata')
  if (!cartItemsSnapshot || !Array.isArray(cartItemsSnapshot)) throw new Error('Cart items snapshot not found or invalid in the PaymentIntent metadata')

  const order = await engine.create({
    collection: 'orders',
    data: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency.toUpperCase(),
      ...(user ? { customer: user.id } : { customerEmail }),
      items: cartItemsSnapshot,
      shippingAddress: shippingAddress ?? null,
      status: 'processing',
      transactions: [transaction.id],
    },
    overrideAccess: true,
  })

  const timestamp = new Date().toISOString()
  await engine.update({ collection: 'carts', id: Number(cartID), data: { purchasedAt: timestamp }, overrideAccess: true })
  await engine.update({ collection: 'transactions', id: transaction.id, data: { order: order.id, status: 'succeeded' }, overrideAccess: true })

  for (const item of transaction.items ?? []) {
    const productId = cartItemProductId(item)
    if (!productId || !item.quantity) continue
    const product = await engine.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true })
    const currentInventory = (product as { inventory?: number } | null)?.inventory
    // `undefined`/`null` inventory means unlimited stock (matching the real
    // plugin's own `defaultProductsValidation.js` reading of the same
    // field) - nothing to decrement.
    if (typeof currentInventory !== 'number') continue
    await engine.update({ collection: 'products', id: productId, data: { inventory: currentInventory - item.quantity }, overrideAccess: true, draft: false })
  }

  // `message` here really is 'Payment initiated successfully', not a typo
  // introduced by this port - the real plugin's own `confirmOrder.js`
  // returns that exact string on a successful CONFIRM, reproduced verbatim.
  return { message: 'Payment initiated successfully', orderID: order.id as number, transactionID: transaction.id }
}
