import type Stripe from 'stripe'

import type { BillingInterval, SubscriptionStatus } from './plan'

/**
 * Stripe side of subscriptions. Server only.
 *
 * Prices are found or created by LOOKUP KEY, not stored on the product: a key such as
 * `shop_sub_p12_aud_2500_month1` names exactly one recurring price (amount, currency, period), so a
 * product that changes price gets a new key and a new price, and an old subscription keeps its old
 * price. Stripe refuses a second price with the same key, which is what makes concurrent saves safe.
 */

export type StripeLike = Pick<Stripe, 'prices' | 'customers' | 'checkout' | 'subscriptions'>

const PRICE_KEY_PREFIX = 'shop_sub'

export const recurringLookupKey = (productId: number | string, currency: string, amountCents: number, interval: BillingInterval, intervalCount: number): string =>
  `${PRICE_KEY_PREFIX}_p${productId}_${currency.toLowerCase()}_${amountCents}_${interval}${intervalCount}`

export const feeLookupKey = (productId: number | string, currency: string, feeCents: number): string =>
  `${PRICE_KEY_PREFIX}_fee_p${productId}_${currency.toLowerCase()}_${feeCents}`

async function priceByKey(stripe: StripeLike, key: string): Promise<Stripe.Price | null> {
  const found = await stripe.prices.list({ lookup_keys: [key], limit: 1 })
  return found.data[0] ?? null
}

/** Finds the recurring price for this product, creating it (and its Stripe product) when missing. Returns the price id. */
export async function ensureRecurringPrice(
  stripe: StripeLike,
  args: { productId: number; title: string; currency: string; amountCents: number; interval: BillingInterval; intervalCount: number },
): Promise<string> {
  const key = recurringLookupKey(args.productId, args.currency, args.amountCents, args.interval, args.intervalCount)
  const existing = await priceByKey(stripe, key)
  if (existing) return existing.id
  try {
    const price = await stripe.prices.create({
      currency: args.currency.toLowerCase(),
      unit_amount: args.amountCents,
      recurring: { interval: args.interval, interval_count: args.intervalCount },
      product_data: { name: args.title.slice(0, 250), metadata: { shopProductId: String(args.productId) } },
      lookup_key: key,
      metadata: { shopProductId: String(args.productId) },
    })
    return price.id
  } catch (error) {
    // Another request may have created the same price a moment earlier: use that one.
    const again = await priceByKey(stripe, key)
    if (again) return again.id
    throw error
  }
}

/** Finds or creates the one-off sign-up fee price. Returns the price id. */
export async function ensureFeePrice(stripe: StripeLike, args: { productId: number; title: string; currency: string; feeCents: number }): Promise<string> {
  const key = feeLookupKey(args.productId, args.currency, args.feeCents)
  const existing = await priceByKey(stripe, key)
  if (existing) return existing.id
  try {
    const price = await stripe.prices.create({
      currency: args.currency.toLowerCase(),
      unit_amount: args.feeCents,
      product_data: { name: `Sign-up fee: ${args.title}`.slice(0, 250), metadata: { shopProductId: String(args.productId) } },
      lookup_key: key,
      metadata: { shopProductId: String(args.productId) },
    })
    return price.id
  } catch (error) {
    const again = await priceByKey(stripe, key)
    if (again) return again.id
    throw error
  }
}

/** The Stripe customer for this email, reused when there is one. */
export async function findOrCreateCustomer(stripe: StripeLike, email: string, userId: number): Promise<string> {
  const existing = (await stripe.customers.list({ email, limit: 1 })).data[0]
  if (existing) return existing.id
  return (await stripe.customers.create({ email, metadata: { userId: String(userId) } })).id
}

/**
 * Stripe Checkout in subscription mode. The sign-up fee is a one-off line, so Stripe adds it to the
 * first invoice only. `metadata` is copied onto the subscription, which is how the webhook knows the
 * subscription belongs to the shop and not to a membership.
 */
export async function createSubscriptionCheckout(
  stripe: StripeLike,
  args: { customerId: string; priceId: string; feePriceId: string | null; trialDays: number; successUrl: string; cancelUrl: string; metadata: Record<string, string> },
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: args.customerId,
    line_items: [{ price: args.priceId, quantity: 1 }, ...(args.feePriceId ? [{ price: args.feePriceId, quantity: 1 }] : [])],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    subscription_data: { ...(args.trialDays > 0 ? { trial_period_days: args.trialDays } : {}), metadata: args.metadata },
    metadata: args.metadata,
  })
  if (!session.url) throw new Error('Stripe did not return a checkout page.')
  return session.url
}

type SubscriptionLike = { status: string; cancel_at_period_end?: boolean | null; pause_collection?: unknown }

/** Our status for a Stripe subscription. Pausing leaves Stripe's own status as "active", so it is read from pause_collection. */
export function statusFromStripe(subscription: SubscriptionLike): SubscriptionStatus {
  const s = subscription.status
  if (s === 'canceled' || s === 'incomplete_expired') return 'cancelled'
  if (s === 'incomplete') return 'incomplete'
  if (s === 'past_due' || s === 'unpaid') return 'past-due'
  if (s === 'paused') return 'paused'
  if (subscription.cancel_at_period_end) return 'cancelling'
  if (subscription.pause_collection) return 'paused'
  if (s === 'trialing') return 'trialing'
  return 'active'
}

/** The end of the current billing period, as ISO text. Stripe moved this between the subscription and its items, so both are read. */
export function periodEndOf(subscription: unknown): string | null {
  const record = subscription as Record<string, unknown>
  const items = (record.items as { data?: Record<string, unknown>[] } | undefined)?.data
  const seconds = [record.current_period_end, items?.[0]?.current_period_end].find((value): value is number => typeof value === 'number')
  return seconds === undefined ? null : new Date(seconds * 1000).toISOString()
}

/** The subscription an invoice belongs to. Read from both places Stripe has put it over the API versions. */
export function subscriptionIdOf(invoice: unknown): string | null {
  const record = invoice as Record<string, unknown>
  const flat = record.subscription
  if (typeof flat === 'string') return flat
  if (flat && typeof flat === 'object' && typeof (flat as { id?: unknown }).id === 'string') return (flat as { id: string }).id
  const parent = record.parent as { subscription_details?: { subscription?: unknown } } | undefined
  const nested = parent?.subscription_details?.subscription
  if (typeof nested === 'string') return nested
  if (nested && typeof nested === 'object' && typeof (nested as { id?: unknown }).id === 'string') return (nested as { id: string }).id
  return null
}
