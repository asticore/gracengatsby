import Stripe from 'stripe'

import type { EngineSignup } from './signup'
import type { MemberSettings, MembershipDoc, MembershipTierDoc } from './types'

import { findTierBySlug } from './entitlement'
import { MEMBERSHIPS_SLUG } from './slugs'

/**
 * Subscription billing, on the Stripe account the shop already uses.
 *
 * The shop's `stripeAdapter` only knows about one-off PaymentIntents - it has
 * no subscription surface at all - so this file talks to Stripe directly with
 * the same secret key rather than pretending the adapter can do something it
 * cannot. What it does reuse is the adapter's webhook endpoint: the handlers in
 * webhooks.ts are handed to `stripeAdapter({ webhooks })`, so there is one
 * signed webhook route for the whole site instead of two.
 *
 * SCOPE - what is built and what is not:
 *   BUILT   creating a subscription (Checkout, subscription mode, trials),
 *           cancelling one, switching tier with proration, and the webhook
 *           handlers that move a membership through its lifecycle.
 *   NOT BUILT  dunning. A failed payment marks the membership past-due, which
 *           locks the content, and stops there. No retry schedule, no
 *           card-expiring warning, no "we tried again" emails. Stripe's own
 *           retry settings still apply on its side; nothing in this project
 *           chases the member.
 */

const API_VERSION = '2025-06-30.preview'

export type BillingClient = Stripe

/**
 * Returns null rather than throwing when Stripe is not configured, so a site
 * with free tiers only works without a Stripe key at all.
 */
export const stripeClient = (secretKey = process.env.STRIPE_SECRET_KEY): BillingClient | null => {
  if (!secretKey) return null
  return new Stripe(secretKey, {
    // Only the newest version is type-safe, per Stripe's own guidance - the
    // shop adapter pins it the same way.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - possible versions are not a type-safe union
    apiVersion: API_VERSION,
    appInfo: { name: 'Asticore Engage Members' },
  })
}

export type BillingFailure =
  | 'feature-off'
  | 'not-configured'
  | 'no-tier'
  | 'tier-not-billable'
  | 'currency-mismatch'
  | 'no-subscription'
  | 'cancellation-disabled'
  | 'stripe-error'

export type StartSubscriptionResult =
  | { ok: true; checkoutUrl: string; membershipId: number | string }
  | { ok: false; reason: BillingFailure; error: string }

const failed = (reason: BillingFailure, error: string) => ({ ok: false as const, reason, error })

const tierOf = (value: MembershipDoc['tier']): MembershipTierDoc | null =>
  value && typeof value === 'object' ? (value as MembershipTierDoc) : null

/**
 * Puts a member in front of Stripe Checkout for a recurring price.
 *
 * Checkout rather than a bare Subscription create: it collects the card, does
 * SCA and handles the three-quarters of payment-method edge cases that would
 * otherwise have to be built here, and it is the only route that works from a
 * Worker without shipping card fields ourselves.
 *
 * Nothing about the membership is marked paid at this point. The membership row
 * exists as `pending` and only the webhook moves it on - a browser that lands
 * back on the success URL proves nothing about whether the money arrived.
 */
export const startSubscription = async (
  engine: EngineSignup,
  settings: MemberSettings,
  args: {
    userId: number | string
    userEmail: string
    tierSlug: string
    successUrl: string
    cancelUrl: string
    client?: BillingClient | null
  },
): Promise<StartSubscriptionResult> => {
  if (!settings.featureEnabled) return failed('feature-off', 'Memberships are not switched on for this site.')

  const stripe = args.client ?? stripeClient()
  if (!stripe) {
    return failed('not-configured', 'Card payments are not set up for this site yet.')
  }

  const tier = await findTierBySlug(engine, args.tierSlug)
  if (!tier) return failed('no-tier', `There is no membership tier called "${args.tierSlug}".`)
  if (tier.active === false) return failed('no-tier', `The ${tier.name} tier is not open to new members.`)

  const priceId = tier.stripePriceId?.trim()
  if (!priceId) {
    return failed(
      'tier-not-billable',
      `The ${tier.name} tier has no Stripe price attached, so it cannot be subscribed to.`,
    )
  }

  try {
    // Checked rather than assumed: a price created in the wrong currency
    // charges a real card the wrong amount, and Stripe will happily do it.
    const price = await stripe.prices.retrieve(priceId)
    if (price.currency?.toUpperCase() !== settings.billing.currency.toUpperCase()) {
      return failed(
        'currency-mismatch',
        `The ${tier.name} price is in ${price.currency?.toUpperCase()} but this site bills in ${settings.billing.currency}.`,
      )
    }

    const customer = await findOrCreateCustomer(stripe, args.userEmail)

    const membership = (await engine.create({
      collection: MEMBERSHIPS_SLUG,
      data: {
        user: args.userId,
        tier: tier.id,
        status: 'pending',
        externalCustomerId: customer.id,
      },
      overrideAccess: true,
    })) as MembershipDoc

    const trialDays = tier.trialDays ?? 0

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      // The webhook has no other way to find the row it must update - the
      // subscription id does not exist until Checkout completes.
      client_reference_id: String(membership.id),
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { membershipId: String(membership.id), tierSlug: tier.slug },
      },
      metadata: { membershipId: String(membership.id) },
    })

    if (!session.url) return failed('stripe-error', 'Stripe did not return a checkout page.')

    return { ok: true, checkoutUrl: session.url, membershipId: membership.id }
  } catch (error) {
    return failed('stripe-error', error instanceof Error ? error.message : 'Stripe refused the request.')
  }
}

const findOrCreateCustomer = async (stripe: BillingClient, email: string): Promise<Stripe.Customer> => {
  const existing = (await stripe.customers.list({ email, limit: 1 })).data[0]
  if (existing) return existing
  return stripe.customers.create({ email })
}

export type CancelResult =
  | { ok: true; endsAt: string | null; immediate: boolean }
  | { ok: false; reason: BillingFailure; error: string }

/**
 * Ends a membership at the end of the period the member has already paid for.
 *
 * Not immediately, and deliberately: cutting access off the moment somebody
 * clicks cancel takes away time they paid for, and produces a refund request
 * every time. The row goes to `cancelled`, which the gate still honours until
 * `renewsAt` passes - see `grantsAccess`.
 */
export const cancelSubscription = async (
  engine: EngineSignup,
  settings: MemberSettings,
  args: {
    membership: MembershipDoc
    /** Set by an admin acting on a member's behalf; skips the self-serve check. */
    byAdmin?: boolean
    client?: BillingClient | null
  },
): Promise<CancelResult> => {
  if (!settings.featureEnabled) return failed('feature-off', 'Memberships are not switched on for this site.')
  if (!settings.billing.allowCancellation && !args.byAdmin) {
    return failed(
      'cancellation-disabled',
      'Memberships on this site cannot be cancelled online - please get in touch.',
    )
  }

  const subscriptionId = args.membership.externalSubscriptionId?.trim()
  const now = new Date().toISOString()

  // A membership with no subscription behind it (a free tier, or one an admin
  // created by hand) still has to be cancellable, or the member is stuck.
  if (!subscriptionId) {
    await engine.update({
      collection: MEMBERSHIPS_SLUG,
      id: args.membership.id,
      data: { status: 'cancelled', cancelledAt: now, cancelAtPeriodEnd: false },
      overrideAccess: true,
    })
    return { ok: true, endsAt: null, immediate: true }
  }

  const stripe = args.client ?? stripeClient()
  if (!stripe) return failed('not-configured', 'Card payments are not set up for this site yet.')

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
    const endsAt = periodEnd(updated)

    await engine.update({
      collection: MEMBERSHIPS_SLUG,
      id: args.membership.id,
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelAtPeriodEnd: true,
        ...(endsAt ? { renewsAt: endsAt } : {}),
      },
      overrideAccess: true,
    })

    return { ok: true, endsAt, immediate: false }
  } catch (error) {
    return failed('stripe-error', error instanceof Error ? error.message : 'Stripe refused the request.')
  }
}

export type ChangeTierResult =
  | { ok: true; tierSlug: string; prorated: boolean }
  | { ok: false; reason: BillingFailure; error: string }

/**
 * Moves an existing subscription onto a different tier's price.
 *
 * `proration_behavior` comes straight from the Billing setting, so the checkbox
 * on the settings screen is the actual behaviour rather than a description of
 * one. Without proration the member is charged a full new period immediately;
 * with it, only the difference for the days remaining.
 */
export const changeTier = async (
  engine: EngineSignup,
  settings: MemberSettings,
  args: { membership: MembershipDoc; newTierSlug: string; client?: BillingClient | null },
): Promise<ChangeTierResult> => {
  if (!settings.featureEnabled) return failed('feature-off', 'Memberships are not switched on for this site.')

  const tier = await findTierBySlug(engine, args.newTierSlug)
  if (!tier) return failed('no-tier', `There is no membership tier called "${args.newTierSlug}".`)

  const priceId = tier.stripePriceId?.trim()
  const subscriptionId = args.membership.externalSubscriptionId?.trim()

  // A free tier has no price, so there is nothing for Stripe to switch to -
  // the subscription is ended and the row moved across instead.
  if (!priceId || !subscriptionId) {
    if (subscriptionId) {
      const stripe = args.client ?? stripeClient()
      if (stripe) await stripe.subscriptions.cancel(subscriptionId).catch((): undefined => undefined)
    }
    await engine.update({
      collection: MEMBERSHIPS_SLUG,
      id: args.membership.id,
      data: { tier: tier.id, externalSubscriptionId: null },
      overrideAccess: true,
    })
    return { ok: true, tierSlug: tier.slug, prorated: false }
  }

  const stripe = args.client ?? stripeClient()
  if (!stripe) return failed('not-configured', 'Card payments are not set up for this site yet.')

  try {
    const current = await stripe.subscriptions.retrieve(subscriptionId)
    const item = current.items?.data?.[0]
    if (!item) return failed('no-subscription', 'That subscription has nothing to change.')

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: settings.billing.proration ? 'create_prorations' : 'none',
      metadata: { ...(current.metadata ?? {}), tierSlug: tier.slug },
    })

    const endsAt = periodEnd(updated)

    await engine.update({
      collection: MEMBERSHIPS_SLUG,
      id: args.membership.id,
      data: { tier: tier.id, ...(endsAt ? { renewsAt: endsAt } : {}) },
      overrideAccess: true,
    })

    return { ok: true, tierSlug: tier.slug, prorated: settings.billing.proration }
  } catch (error) {
    return failed('stripe-error', error instanceof Error ? error.message : 'Stripe refused the request.')
  }
}

/**
 * The end of the paid period, as an ISO string.
 *
 * Stripe moved this from the subscription onto its items, and which one is
 * populated depends on the API version the account is pinned to, so both are
 * read. Getting this wrong would leave `renewsAt` empty and every membership
 * looking like it never expires.
 */
export const periodEnd = (subscription: Stripe.Subscription): string | null => {
  const record = subscription as unknown as Record<string, unknown>
  const onSubscription = record.current_period_end
  const onItem = (subscription.items?.data?.[0] as unknown as Record<string, unknown> | undefined)
    ?.current_period_end
  const seconds = typeof onSubscription === 'number' ? onSubscription : typeof onItem === 'number' ? onItem : null
  return seconds === null ? null : new Date(seconds * 1000).toISOString()
}

export { tierOf as billingTierOf }
