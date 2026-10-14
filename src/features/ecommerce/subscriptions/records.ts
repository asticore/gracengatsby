import { periodEndOf, statusFromStripe } from './stripe'
import type { SubscriptionStatus } from './plan'

/**
 * Reads and writes the `product-subscriptions` collection. Server only, always with overrideAccess:
 * the customer and staff rules are applied by the callers (manage.ts, the API routes).
 */

export const SUBSCRIPTIONS = 'product-subscriptions'
const HISTORY_LIMIT = 100

export type SubEngine = {
  find(args: Record<string, unknown>): Promise<{ docs: unknown[] }>
  findByID(args: Record<string, unknown>): Promise<unknown>
  create(args: Record<string, unknown>): Promise<unknown>
  update(args: Record<string, unknown>): Promise<unknown>
  findGlobal(args: Record<string, unknown>): Promise<unknown>
}

export type HistoryEntry = { at: string; text: string; invoiceId?: string; orderId?: number }

export type SubscriptionRecord = {
  id: number
  customer?: number | { id: number } | null
  customerEmail?: string | null
  product?: number | { id: number } | null
  productName?: string | null
  status: SubscriptionStatus
  amountCents?: number | null
  currency?: string | null
  billingInterval?: string | null
  billingIntervalCount?: number | null
  paymentsLimit?: number | null
  paymentsMade?: number | null
  startedAt?: string | null
  trialEndsAt?: string | null
  nextPaymentAt?: string | null
  cancelledAt?: string | null
  endedAt?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
  history?: HistoryEntry[] | null
}

/** The Stripe subscription fields this code reads. Stripe's own object satisfies it. */
export type StripeSubscriptionLike = {
  id: string
  status: string
  created: number
  customer?: string | { id: string } | null
  cancel_at_period_end?: boolean | null
  pause_collection?: unknown
  trial_end?: number | null
  current_period_end?: number
  metadata?: Record<string, string> | null
  items?: { data: Array<{ current_period_end?: number; price?: { id: string; currency?: string; unit_amount?: number | null; recurring?: { interval: string; interval_count?: number } | null } }> }
}

/** A relationship value as an id: the bare number, or the populated document. */
export const idOfRelation = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return null
}

export async function findRecordByStripeSubscription(engine: SubEngine, subscriptionId: string): Promise<SubscriptionRecord | null> {
  const { docs } = await engine.find({
    collection: SUBSCRIPTIONS,
    where: { stripeSubscriptionId: { equals: subscriptionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (docs[0] as SubscriptionRecord | undefined) ?? null
}

export async function findRecordByID(engine: SubEngine, id: number): Promise<SubscriptionRecord | null> {
  return ((await engine.findByID({ collection: SUBSCRIPTIONS, id, depth: 0, overrideAccess: true })) as SubscriptionRecord | null) ?? null
}

export async function updateRecord(engine: SubEngine, id: number, data: Record<string, unknown>): Promise<void> {
  await engine.update({ collection: SUBSCRIPTIONS, id, data, overrideAccess: true })
}

/** Adds entries to the history, keeping the newest. The history is read from the record passed in. */
export function withHistory(record: SubscriptionRecord, entries: HistoryEntry[]): HistoryEntry[] {
  return [...(record.history ?? []), ...entries].slice(-HISTORY_LIMIT)
}

/**
 * The record for a Stripe subscription that the shop started. Returns null when the subscription
 * was not started from the shop (a membership, or anything else on the account).
 */
export async function createRecordFromSubscription(engine: SubEngine, subscription: StripeSubscriptionLike, now: string): Promise<SubscriptionRecord | null> {
  const meta = subscription.metadata ?? {}
  const productId = Number(meta.shopProductId)
  if (!Number.isInteger(productId) || productId <= 0) return null
  const price = subscription.items?.data?.[0]?.price
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id ?? null)
  const userId = Number(meta.userId)
  const data = {
    ...(Number.isInteger(userId) && userId > 0 ? { customer: userId } : {}),
    customerEmail: meta.customerEmail || null,
    product: productId,
    productName: meta.productName || 'Subscription',
    status: statusFromStripe(subscription),
    amountCents: price?.unit_amount ?? 0,
    currency: (price?.currency ?? 'aud').toUpperCase(),
    billingInterval: price?.recurring?.interval ?? 'month',
    billingIntervalCount: price?.recurring?.interval_count ?? 1,
    paymentsLimit: Number(meta.paymentsLimit) || 0,
    paymentsMade: 0,
    startedAt: now,
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    nextPaymentAt: periodEndOf(subscription),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: price?.id ?? null,
    history: [{ at: now, text: 'Subscription started.' }],
  }
  return (await engine.create({ collection: SUBSCRIPTIONS, data, overrideAccess: true })) as SubscriptionRecord
}
