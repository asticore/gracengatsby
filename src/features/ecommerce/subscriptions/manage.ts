import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from './plan'
import { idOfRelation, findRecordByID, updateRecord, withHistory, type SubEngine } from './records'
import { periodEndOf, statusFromStripe, type StripeLike } from './stripe'

/**
 * What a customer or a member of staff may do to a subscription. Every change goes to Stripe first and
 * the record follows what Stripe says, so the two cannot drift apart.
 *
 * Cancel and pause take effect at the end of the paid period (cancel) or from the next payment
 * (pause, which voids the invoices while it lasts). Nothing here refunds or cuts off paid time.
 */

export type ManageAction = 'cancel' | 'keep' | 'pause' | 'resume'
export type Actor = { by: 'customer'; userId: number } | { by: 'staff' }

export type ManageResult = { ok: true; status: SubscriptionStatus } | { ok: false; error: string }

const ALLOWED_FROM: Record<ManageAction, SubscriptionStatus[]> = {
  cancel: ['active', 'trialing', 'past-due', 'paused'],
  keep: ['cancelling'],
  pause: ['active', 'trialing'],
  resume: ['paused'],
}

const UNKNOWN = 'That subscription could not be found.'

export async function manageSubscription(deps: { engine: SubEngine; stripe: StripeLike; now?: () => Date }, args: { id: number; action: ManageAction; actor: Actor }): Promise<ManageResult> {
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const record = await findRecordByID(deps.engine, args.id)
  if (!record) return { ok: false, error: UNKNOWN }
  // A customer only ever sees "not found" for someone else's subscription, so ids cannot be probed.
  if (args.actor.by === 'customer' && idOfRelation(record.customer) !== args.actor.userId) return { ok: false, error: UNKNOWN }
  if (!ALLOWED_FROM[args.action].includes(record.status)) {
    return { ok: false, error: `This subscription cannot be changed that way right now. Its status is: ${SUBSCRIPTION_STATUS_LABELS[record.status]}.` }
  }
  const subscriptionId = record.stripeSubscriptionId
  if (!subscriptionId) return { ok: false, error: 'This subscription is not linked to Stripe, so it cannot be changed here.' }

  const change: Record<ManageAction, Record<string, unknown>> = {
    cancel: { cancel_at_period_end: true },
    keep: { cancel_at_period_end: false },
    pause: { pause_collection: { behavior: 'void' } },
    resume: { pause_collection: '' },
  }
  const who = args.actor.by === 'staff' ? 'by shop staff' : 'by the customer'
  const text: Record<ManageAction, string> = {
    cancel: `Cancelled ${who}. It ends at the end of the paid period.`,
    keep: `Cancellation undone ${who}.`,
    pause: `Paused ${who}. No payment is taken until it is resumed.`,
    resume: `Resumed ${who}.`,
  }

  let subscription
  try {
    subscription = await deps.stripe.subscriptions.update(subscriptionId, change[args.action] as never)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Stripe refused the change. Try again in a moment.' }
  }

  const status = statusFromStripe(subscription as unknown as Parameters<typeof statusFromStripe>[0])
  await updateRecord(deps.engine, record.id, {
    status,
    nextPaymentAt: periodEndOf(subscription) ?? record.nextPaymentAt ?? null,
    ...(args.action === 'cancel' && !record.cancelledAt ? { cancelledAt: now } : {}),
    history: withHistory(record, [{ at: now, text: text[args.action] }]),
  })
  return { ok: true, status }
}
