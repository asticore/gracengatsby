import type Stripe from 'stripe'
import type { PayloadRequest } from 'payload'

import type { EngineSignup } from './signup'
import type { MembershipDoc, MembershipStatus } from './types'

import { getMemberSettings } from './settings'
import { periodEnd } from './billing'
import { sendWelcomeEmail } from './emails'
import { MEMBERSHIPS_SLUG } from './slugs'

/**
 * What Stripe tells us, turned into membership state.
 *
 * These handlers are the ONLY thing that marks a membership paid. The browser
 * coming back to a success URL proves the member clicked a button, not that a
 * card cleared, so nothing on the return path is trusted. The adapter has
 * already verified the signature before any of this runs.
 *
 * Hand them to the existing shop adapter (`stripeAdapter({ webhooks })`) rather
 * than adding a second webhook route - one signed endpoint, one secret to
 * rotate, one URL to register with Stripe.
 *
 * NOT handled here: dunning. `invoice.payment_failed` locks the content and
 * stops. Nothing retries, warns about an expiring card, or emails the member
 * about a failed payment.
 */

type HandlerArgs = { event: Stripe.Event; req: PayloadRequest; stripe: Stripe }

const engineOf = (req: PayloadRequest): EngineSignup => req.payload as unknown as EngineSignup

/**
 * Stripe's subscription states, mapped onto ours.
 *
 * `incomplete_expired` and `canceled` both mean access is over, but they are
 * kept apart from a member-requested cancellation: `cancelled` in this system
 * means "asked to stop, still inside the paid period", so a subscription Stripe
 * has actually ended becomes `expired`.
 */
const STATUS_MAP: Record<string, MembershipStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past-due',
  unpaid: 'past-due',
  incomplete: 'pending',
  incomplete_expired: 'expired',
  canceled: 'expired',
  paused: 'expired',
}

const mapStatus = (subscription: Stripe.Subscription): MembershipStatus => {
  const mapped = STATUS_MAP[subscription.status] ?? 'pending'
  // A live subscription with a cancellation scheduled is still paid up, and the
  // member keeps access until the period ends - `grantsAccess` reads the date.
  if (subscription.cancel_at_period_end && (mapped === 'active' || mapped === 'trialing')) {
    return 'cancelled'
  }
  return mapped
}

const findBySubscription = async (
  engine: EngineSignup,
  subscriptionId: string,
): Promise<MembershipDoc | null> => {
  const { docs } = await engine
    .find({
      collection: MEMBERSHIPS_SLUG,
      where: { externalSubscriptionId: { equals: subscriptionId } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
    .catch((): { docs: unknown[] } => ({ docs: [] }))
  return (docs[0] as MembershipDoc) ?? null
}

const applySubscription = async (
  req: PayloadRequest,
  subscription: Stripe.Subscription,
  membership: MembershipDoc | null,
): Promise<void> => {
  if (!membership) return
  const engine = engineOf(req)

  await engine.update({
    collection: MEMBERSHIPS_SLUG,
    id: membership.id,
    data: {
      status: mapStatus(subscription),
      externalSubscriptionId: subscription.id,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      renewsAt: periodEnd(subscription),
      ...(subscription.trial_end
        ? { trialEndsAt: new Date(subscription.trial_end * 1000).toISOString() }
        : {}),
      ...(subscription.canceled_at
        ? { cancelledAt: new Date(subscription.canceled_at * 1000).toISOString() }
        : {}),
    },
    overrideAccess: true,
  })
}

export const membershipWebhooks = {
  /**
   * The moment a subscription starts. `client_reference_id` carries the
   * membership row that was created as `pending` before Checkout opened, which
   * is how the payment is tied back to a person - Stripe knows an email, not a
   * user id.
   */
  'checkout.session.completed': async ({ event, req, stripe }: HandlerArgs): Promise<void> => {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription') return

    const membershipId = session.client_reference_id ?? session.metadata?.membershipId
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!membershipId || !subscriptionId) return

    const engine = engineOf(req)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    await engine.update({
      collection: MEMBERSHIPS_SLUG,
      id: membershipId,
      data: {
        status: mapStatus(subscription),
        externalSubscriptionId: subscription.id,
        externalCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        startedAt: new Date(subscription.start_date * 1000).toISOString(),
        renewsAt: periodEnd(subscription),
        ...(subscription.trial_end
          ? { trialEndsAt: new Date(subscription.trial_end * 1000).toISOString() }
          : {}),
      },
      overrideAccess: true,
    })

    // Read back at depth 1 so the mailer has the address and the tier name.
    // `sendWelcomeEmail` is idempotent, which matters because Stripe redelivers
    // this event on any non-200.
    const { docs } = await engine.find({
      collection: MEMBERSHIPS_SLUG,
      where: { id: { equals: membershipId } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })

    const membership = docs[0] as MembershipDoc | undefined
    if (!membership) return

    const settings = await getMemberSettings(req.payload)
    await sendWelcomeEmail(engine, membership, settings).catch((): undefined => undefined)
  },

  'customer.subscription.updated': async ({ event, req }: HandlerArgs): Promise<void> => {
    const subscription = event.data.object as Stripe.Subscription
    await applySubscription(req, subscription, await findBySubscription(engineOf(req), subscription.id))
  },

  'customer.subscription.deleted': async ({ event, req }: HandlerArgs): Promise<void> => {
    const subscription = event.data.object as Stripe.Subscription
    const membership = await findBySubscription(engineOf(req), subscription.id)
    if (!membership) return

    await engineOf(req).update({
      collection: MEMBERSHIPS_SLUG,
      id: membership.id,
      data: {
        status: 'expired',
        cancelAtPeriodEnd: false,
        cancelledAt:
          membership.cancelledAt ??
          (subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null),
      },
      overrideAccess: true,
    })
  },

  /**
   * A renewal that went through. Pushes the expiry date forward, which is what
   * the gate and the reminder sweep both read.
   */
  'invoice.paid': async ({ event, req, stripe }: HandlerArgs): Promise<void> => {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = subscriptionIdOf(invoice)
    if (!subscriptionId) return

    const membership = await findBySubscription(engineOf(req), subscriptionId)
    if (!membership) return

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await applySubscription(req, subscription, membership)
  },

  /**
   * Locks the content and nothing else. This is the honest limit of what is
   * built: Stripe's own retry schedule still runs, but this project does not
   * chase the member, warn them, or escalate.
   */
  'invoice.payment_failed': async ({ event, req }: HandlerArgs): Promise<void> => {
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = subscriptionIdOf(invoice)
    if (!subscriptionId) return

    const membership = await findBySubscription(engineOf(req), subscriptionId)
    if (!membership) return

    await engineOf(req).update({
      collection: MEMBERSHIPS_SLUG,
      id: membership.id,
      data: { status: 'past-due' },
      overrideAccess: true,
    })
  },
}

/**
 * Stripe moved the subscription reference off the invoice and onto its parent
 * in recent API versions; older accounts still send the flat field. Both are
 * read so the handlers work whichever version the account is pinned to.
 */
const subscriptionIdOf = (invoice: Stripe.Invoice): string | null => {
  const record = invoice as unknown as Record<string, unknown>
  const flat = record.subscription
  if (typeof flat === 'string') return flat
  if (flat && typeof flat === 'object' && typeof (flat as { id?: unknown }).id === 'string') {
    return (flat as { id: string }).id
  }
  const parent = record.parent as { subscription_details?: { subscription?: unknown } } | undefined
  const nested = parent?.subscription_details?.subscription
  if (typeof nested === 'string') return nested
  if (nested && typeof nested === 'object' && typeof (nested as { id?: unknown }).id === 'string') {
    return (nested as { id: string }).id
  }
  return null
}
