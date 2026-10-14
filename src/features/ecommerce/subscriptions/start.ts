import { loadPricedLines } from '../server/pricing'
import { loadShopCurrency } from '../lib/shopCurrency'
import { getStripeClient } from '../payments/stripeAdapter'
import { normalisePlan, planProblems, isLiveStatus, signupFeeCents } from './plan'
import { subscriptionsOn, stripeSecretFor } from './gate'
import { findOrCreateCustomer, createSubscriptionCheckout, ensureFeePrice, ensureRecurringPrice, type StripeLike } from './stripe'
import type { SubEngine } from './records'

/**
 * Starts a subscription: prices the product on the server, makes sure the Stripe prices exist, and
 * returns a Stripe Checkout address for it. Nothing is charged here. The subscription record is made
 * when Stripe confirms the checkout (webhooks.ts), so a customer who backs out leaves nothing behind.
 *
 * Subscriptions skip the cart. One product, quantity one, bought from its own page.
 */

export type StartResult = { ok: true; url: string } | { ok: false; error: string }

export const SUBSCRIPTION_CURRENCY_MINIMUM_CENTS = 50

type Product = { id: number; title?: string; slug?: string; productType?: string; subscription?: unknown }

export async function startSubscriptionCheckout(args: {
  engine: SubEngine
  user: { id: number; email?: string | null }
  product: Product
  origin: string
  client?: StripeLike | null
}): Promise<StartResult> {
  const { engine, user, product } = args
  if (!(await subscriptionsOn(engine))) return { ok: false, error: 'Subscriptions are not switched on in this shop.' }
  const secret = await stripeSecretFor(engine)
  if (!secret && !args.client) return { ok: false, error: 'Subscriptions need Stripe card payments, which are not set up on this shop.' }
  if (product.productType && product.productType !== 'simple' && product.productType !== 'variable') {
    return { ok: false, error: 'This product cannot be bought as a subscription.' }
  }
  const plan = normalisePlan(product.subscription)
  if (!plan.enabled || planProblems(plan).length > 0) return { ok: false, error: 'This product is not sold as a subscription.' }
  const email = typeof user.email === 'string' ? user.email.trim() : ''
  if (!email) return { ok: false, error: 'Your account needs an email address before you can subscribe.' }

  const live = await engine.find({
    collection: 'product-subscriptions',
    where: { and: [{ customer: { equals: user.id } }, { product: { equals: product.id } }] },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  if (live.docs.some((doc) => isLiveStatus((doc as { status?: string }).status))) {
    return { ok: false, error: 'You already have a subscription to this product. See My subscriptions.' }
  }

  let unitCents: number | undefined
  try {
    const [line] = await loadPricedLines(engine as never, [{ product: product.id, quantity: 1 }])
    unitCents = line?.unitCents
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'This product cannot be bought right now.' }
  }
  if (!unitCents || unitCents < SUBSCRIPTION_CURRENCY_MINIMUM_CENTS) return { ok: false, error: 'This product is priced too low to be sold as a subscription.' }

  const currency = (await loadShopCurrency(engine as never)).toLowerCase()
  const stripe = args.client ?? getStripeClient(secret)
  const title = String(product.title ?? 'Subscription')
  try {
    const priceId = await ensureRecurringPrice(stripe, { productId: product.id, title, currency, amountCents: unitCents, interval: plan.interval, intervalCount: plan.intervalCount })
    const feeCents = signupFeeCents(plan)
    const feePriceId = feeCents > 0 ? await ensureFeePrice(stripe, { productId: product.id, title, currency, feeCents }) : null
    const customerId = await findOrCreateCustomer(stripe, email, user.id)
    const slug = product.slug ? `/shop/${product.slug}` : '/shop'
    const url = await createSubscriptionCheckout(stripe, {
      customerId,
      priceId,
      feePriceId,
      trialDays: plan.trialDays,
      successUrl: `${args.origin}/account/subscriptions?started=1`,
      cancelUrl: `${args.origin}${slug}`,
      metadata: {
        shopSubscription: '1',
        shopProductId: String(product.id),
        userId: String(user.id),
        customerEmail: email,
        productName: title.slice(0, 200),
        paymentsLimit: String(plan.paymentsLimit),
      },
    })
    return { ok: true, url }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Stripe refused the request. Try again in a moment.' }
  }
}
