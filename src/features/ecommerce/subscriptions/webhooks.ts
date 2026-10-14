import type Stripe from 'stripe'

import { formatCents } from '../lib/money'
import { sendSubscriptionEmail } from './emails'
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from './plan'
import { createRenewalOrder, type InvoiceLike } from './renewal'
import { createRecordFromSubscription, findRecordByStripeSubscription, updateRecord, withHistory, type HistoryEntry, type StripeSubscriptionLike, type SubEngine, type SubscriptionRecord } from './records'
import { periodEndOf, statusFromStripe, subscriptionIdOf, type StripeLike } from './stripe'

/**
 * Stripe events for shop subscriptions. The Stripe webhook route hands every event here first and
 * then to the membership handlers, which ignore anything that is not theirs (and the reverse holds
 * too: these handlers ignore subscriptions without the shop's metadata flag).
 *
 * Handled: checkout.session.completed, invoice.paid, invoice.payment_failed,
 * customer.subscription.updated, customer.subscription.deleted.
 *
 * Every handler is safe to run twice: Stripe redelivers events, and a retry after a failure must not
 * create a second order. A renewal is recorded by its invoice id in the history.
 */

export type WebhookDeps = { engine: SubEngine; stripe: StripeLike; now?: () => Date }

type EventLike = { type: string; data: { object: unknown } }

const isShopSubscription = (subscription: { metadata?: Record<string, string> | null } | null | undefined): boolean => subscription?.metadata?.shopSubscription === '1'

/** Finds the record, or creates it when the shop started this subscription and the record is missing. */
async function recordFor(deps: WebhookDeps, subscription: StripeSubscriptionLike, now: string): Promise<SubscriptionRecord | null> {
  const existing = await findRecordByStripeSubscription(deps.engine, subscription.id)
  if (existing) return existing
  if (!isShopSubscription(subscription)) return null
  const created = await createRecordFromSubscription(deps.engine, subscription, now)
  if (created) await sendSubscriptionEmail('new', created)
  return created
}

/** Returns true when the event was a shop subscription event (handled or deliberately ignored). */
export async function handleShopSubscriptionEvent(deps: WebhookDeps, event: EventLike): Promise<boolean> {
  const now = (deps.now ?? (() => new Date()))().toISOString()
  switch (event.type) {
    case 'checkout.session.completed':
      return onCheckoutCompleted(deps, event.data.object as Stripe.Checkout.Session, now)
    case 'customer.subscription.updated':
      return onSubscriptionUpdated(deps, event.data.object as unknown as StripeSubscriptionLike, now)
    case 'customer.subscription.deleted':
      return onSubscriptionDeleted(deps, event.data.object as unknown as StripeSubscriptionLike, now)
    case 'invoice.paid':
      return onInvoicePaid(deps, event.data.object as unknown as InvoiceLike & { id: string }, now)
    case 'invoice.payment_failed':
      return onInvoiceFailed(deps, event.data.object, now)
    default:
      return false
  }
}

async function onCheckoutCompleted(deps: WebhookDeps, session: Stripe.Checkout.Session, now: string): Promise<boolean> {
  if (session.mode !== 'subscription' || session.metadata?.shopSubscription !== '1') return false
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!subscriptionId) return false
  const subscription = (await deps.stripe.subscriptions.retrieve(subscriptionId)) as unknown as StripeSubscriptionLike
  await recordFor(deps, subscription, now)
  return true
}

async function onSubscriptionUpdated(deps: WebhookDeps, subscription: StripeSubscriptionLike, now: string): Promise<boolean> {
  const record = await findRecordByStripeSubscription(deps.engine, subscription.id)
  if (!record) return false
  const status = statusFromStripe(subscription)
  const changed = status !== record.status
  await updateRecord(deps.engine, record.id, {
    status,
    nextPaymentAt: periodEndOf(subscription) ?? record.nextPaymentAt ?? null,
    ...(status === 'cancelling' && !record.cancelledAt ? { cancelledAt: now } : {}),
    ...(changed ? { history: withHistory(record, [{ at: now, text: `Status is now: ${SUBSCRIPTION_STATUS_LABELS[status]}.` }]) } : {}),
  })
  return true
}

async function onSubscriptionDeleted(deps: WebhookDeps, subscription: StripeSubscriptionLike, now: string): Promise<boolean> {
  const record = await findRecordByStripeSubscription(deps.engine, subscription.id)
  if (!record) return false
  if (record.status === 'cancelled') return true
  await updateRecord(deps.engine, record.id, {
    status: 'cancelled',
    endedAt: now,
    cancelledAt: record.cancelledAt ?? now,
    history: withHistory(record, [{ at: now, text: 'Subscription ended.' }]),
  })
  await sendSubscriptionEmail('cancelled', record)
  return true
}

async function onInvoiceFailed(deps: WebhookDeps, invoiceObject: unknown, now: string): Promise<boolean> {
  const subscriptionId = subscriptionIdOf(invoiceObject)
  if (!subscriptionId) return false
  const record = await findRecordByStripeSubscription(deps.engine, subscriptionId)
  if (!record) return false
  const keepsOwnStatus = record.status === 'cancelling' || record.status === 'paused' || record.status === 'cancelled'
  await updateRecord(deps.engine, record.id, {
    ...(keepsOwnStatus ? {} : { status: 'past-due' as SubscriptionStatus }),
    history: withHistory(record, [{ at: now, text: 'A payment failed. Stripe will try again.' }]),
  })
  await sendSubscriptionEmail('failed', record)
  return true
}

/**
 * A paid invoice. The first one (billing_reason subscription_create) and each renewal
 * (subscription_cycle) with money in it become an order. A free trial's $0 invoice is only noted.
 * Once the number of payments reaches the plan's limit, the subscription is set to end at the end of
 * the period, so no further payment is taken.
 */
async function onInvoicePaid(deps: WebhookDeps, invoice: InvoiceLike & { id: string }, now: string): Promise<boolean> {
  const subscriptionId = subscriptionIdOf(invoice)
  if (!subscriptionId) return false

  let record = await findRecordByStripeSubscription(deps.engine, subscriptionId)
  const subscription = (await deps.stripe.subscriptions.retrieve(subscriptionId)) as unknown as StripeSubscriptionLike
  if (!record) {
    record = await recordFor(deps, subscription, now)
    if (!record) return false
  }
  if ((record.history ?? []).some((entry) => entry.invoiceId === invoice.id)) return true

  const paid = invoice.amount_paid ?? 0
  const reason = invoice.billing_reason ?? ''
  const entries: HistoryEntry[] = []
  let paymentsMade = record.paymentsMade ?? 0
  let orderId: number | undefined
  const isPayment = paid > 0 && (reason === 'subscription_create' || reason === 'subscription_cycle')

  if (isPayment) {
    orderId = await createRenewalOrder(deps.engine, record, invoice, now)
    paymentsMade += 1
    entries.push({ at: now, text: `Payment received: ${formatCents(paid, invoice.currency.toUpperCase())}.`, invoiceId: invoice.id, orderId })
  } else if (paid === 0) {
    entries.push({ at: now, text: 'No payment due for this period (free trial).', invoiceId: invoice.id })
  } else {
    entries.push({ at: now, text: `Other charge received: ${formatCents(paid, invoice.currency.toUpperCase())}. No order was made for it.`, invoiceId: invoice.id })
  }

  let current = subscription
  const limit = record.paymentsLimit ?? 0
  if (limit > 0 && paymentsMade >= limit && !subscription.cancel_at_period_end && subscription.status !== 'canceled') {
    current = (await deps.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true } as never)) as unknown as StripeSubscriptionLike
    entries.push({ at: now, text: 'Final payment taken. The subscription ends at the end of this period.' })
  }

  await updateRecord(deps.engine, record.id, {
    status: statusFromStripe(current),
    paymentsMade,
    nextPaymentAt: periodEndOf(current) ?? record.nextPaymentAt ?? null,
    history: withHistory(record, entries),
  })

  if (isPayment && reason === 'subscription_cycle') {
    await sendSubscriptionEmail('renewal', record, { amountCents: paid, orderId })
  }
  return true
}
