/**
 * Subscription plans for shop products, and the rules that check them.
 *
 * Pure: no engine, no Stripe. The admin card, the storefront, the server and the tests all
 * read plans through here, so a plan means the same thing everywhere.
 *
 * A plan lives in one JSON column on the product (`subscription`, see fields.ts). Money in a
 * plan is whole dollars, like every other product price; the server turns it into cents.
 */

export const BILLING_INTERVALS = ['day', 'week', 'month', 'year'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

export type SubscriptionPlan = {
  enabled: boolean
  interval: BillingInterval
  /** Bill every N intervals, for example every 2 weeks. */
  intervalCount: number
  /** Free days before the first payment. 0 for none. */
  trialDays: number
  /** One-off fee charged with the first payment, in dollars. 0 for none. */
  signupFee: number
  /** Payments taken before the subscription ends by itself. 0 means until cancelled. */
  paymentsLimit: number
}

export const DEFAULT_PLAN: SubscriptionPlan = {
  enabled: false,
  interval: 'month',
  intervalCount: 1,
  trialDays: 0,
  signupFee: 0,
  paymentsLimit: 0,
}

/** Stripe's longest allowed billing period is one year, so the count is capped per interval. */
const MAX_COUNT: Record<BillingInterval, number> = { day: 365, week: 52, month: 12, year: 1 }
const MAX_TRIAL_DAYS = 365
const MAX_SIGNUP_FEE = 10000
const MAX_PAYMENTS = 1000

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Reads a stored or submitted plan, filling any gap with the default. Never throws. */
export function normalisePlan(raw: unknown): SubscriptionPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const interval = BILLING_INTERVALS.find((value) => value === r.interval) ?? DEFAULT_PLAN.interval
  const count = toNumber(r.intervalCount)
  const trial = toNumber(r.trialDays)
  const fee = toNumber(r.signupFee)
  const payments = toNumber(r.paymentsLimit)
  return {
    enabled: r.enabled === true,
    interval,
    intervalCount: count === null ? DEFAULT_PLAN.intervalCount : Math.round(count),
    trialDays: trial === null ? 0 : Math.round(trial),
    signupFee: fee === null ? 0 : Math.round(fee * 100) / 100,
    paymentsLimit: payments === null ? 0 : Math.round(payments),
  }
}

/** Plain sentences saying what is wrong with a plan. Only checked when the plan is switched on. */
export function planProblems(plan: SubscriptionPlan): string[] {
  if (!plan.enabled) return []
  const problems: string[] = []
  const max = MAX_COUNT[plan.interval]
  if (!Number.isInteger(plan.intervalCount) || plan.intervalCount < 1 || plan.intervalCount > max) {
    problems.push(max === 1 ? `Billing every: a subscription can only bill once a ${plan.interval}.` : `Billing every: enter a whole number from 1 to ${max} (up to one year).`)
  }
  if (!Number.isInteger(plan.trialDays) || plan.trialDays < 0 || plan.trialDays > MAX_TRIAL_DAYS) {
    problems.push(`Free trial: enter a whole number of days from 0 to ${MAX_TRIAL_DAYS}.`)
  }
  if (!(plan.signupFee >= 0) || plan.signupFee > MAX_SIGNUP_FEE) {
    problems.push(`Sign-up fee: enter an amount from 0 to ${MAX_SIGNUP_FEE}.`)
  }
  if (!Number.isInteger(plan.paymentsLimit) || plan.paymentsLimit < 0 || plan.paymentsLimit > MAX_PAYMENTS) {
    problems.push(`Number of payments: enter a whole number from 0 (until cancelled) to ${MAX_PAYMENTS}.`)
  }
  return problems
}

/** The fee in cents, for the server. */
export const signupFeeCents = (plan: SubscriptionPlan): number => Math.round(plan.signupFee * 100)

/** "every month", "every 2 weeks". */
export function intervalPhrase(interval: BillingInterval, count: number): string {
  if (count === 1) return `every ${interval}`
  return `every ${count} ${interval}s`
}

/** Where a subscription is in its life, as stored on the subscription record. */
export const SUBSCRIPTION_STATUSES = ['incomplete', 'trialing', 'active', 'past-due', 'paused', 'cancelling', 'cancelled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  incomplete: 'Starting (first payment not taken yet)',
  trialing: 'Free trial',
  active: 'Active',
  'past-due': 'Payment failed, retrying',
  paused: 'Paused',
  cancelling: 'Ends at the end of the paid period',
  cancelled: 'Ended',
}

/** Subscriptions that still take payments or still give access. Used to stop a second one for the same product. */
export const LIVE_STATUSES: readonly SubscriptionStatus[] = ['incomplete', 'trialing', 'active', 'past-due', 'paused', 'cancelling']

export const isLiveStatus = (status: string | null | undefined): boolean => LIVE_STATUSES.includes(status as SubscriptionStatus)
