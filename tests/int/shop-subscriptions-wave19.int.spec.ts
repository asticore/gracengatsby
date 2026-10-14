// @vitest-environment node
// Product subscriptions: plan rules, Stripe status mapping, price lookup keys, the webhook flow (order per
// paid invoice, idempotent replays, payment limits, failed payments, cancellation), customer ownership on
// pause/resume/cancel, and the checkout guards. Stripe, the engine and email are faked; nothing leaves the test.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/features/ecommerce/server/orders', () => ({ addOrderNote: vi.fn(async () => null) }))
vi.mock('@/features/ecommerce/server/db', () => ({
  rawD1: vi.fn(async () => {
    throw new Error('no database in tests')
  }),
}))
vi.mock('@/features/ecommerce/server/pricing', () => ({
  loadPricedLines: vi.fn(async () => [{ unitCents: 2500 }]),
}))
vi.mock('@/features/ecommerce/lib/shopCurrency', () => ({ loadShopCurrency: vi.fn(async () => 'AUD') }))

import { sendEmail } from '@/features/email'
import { normalisePlan, planProblems, intervalPhrase } from '@/features/ecommerce/subscriptions/plan'
import { feeLookupKey, periodEndOf, recurringLookupKey, statusFromStripe, subscriptionIdOf, ensureRecurringPrice } from '@/features/ecommerce/subscriptions/stripe'
import { handleShopSubscriptionEvent } from '@/features/ecommerce/subscriptions/webhooks'
import { manageSubscription } from '@/features/ecommerce/subscriptions/manage'
import { startSubscriptionCheckout } from '@/features/ecommerce/subscriptions/start'

type Row = Record<string, unknown> & { id: number }

/** In-memory stand-in for the engine: enough of find/create/update for these flows. */
function fakeEngine(globals: Record<string, unknown> = {}, rows: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { 'product-subscriptions': [], orders: [], ...rows }
  let next = 100
  return {
    tables,
    async find({ collection, where }: { collection: string; where?: Record<string, { equals: unknown }> }) {
      let list = tables[collection] ?? []
      const wanted = where?.stripeSubscriptionId?.equals
      if (wanted !== undefined) list = list.filter((row) => row.stripeSubscriptionId === wanted)
      return { docs: list.map((row) => ({ ...row })) }
    },
    async findByID({ collection, id }: { collection: string; id: number }) {
      const row = (tables[collection] ?? []).find((r) => r.id === id)
      return row ? { ...row } : null
    },
    async create({ collection, data }: { collection: string; data: Record<string, unknown> }) {
      const row = { id: next++, ...data } as Row
      ;(tables[collection] ??= []).push(row)
      return { ...row }
    },
    async update({ collection, id, data }: { collection: string; id: number; data: Record<string, unknown> }) {
      const row = (tables[collection] ?? []).find((r) => r.id === id)
      if (!row) throw new Error(`no ${collection} ${id}`)
      Object.assign(row, data)
      return { ...row }
    },
    async findGlobal({ slug }: { slug: string }) {
      return globals[slug] ?? null
    },
  }
}

/** Stripe stand-in holding subscriptions in memory. Every call is recorded. */
function fakeStripe(subs: Record<string, Record<string, unknown>>) {
  return {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => ({ ...subs[id] })),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        const next = { ...subs[id], ...params } as Record<string, unknown>
        if ('pause_collection' in params) next.pause_collection = params.pause_collection === '' ? null : params.pause_collection
        subs[id] = next
        return { ...next }
      }),
    },
    prices: {
      list: vi.fn(async () => ({ data: [] as { id: string }[] })),
      create: vi.fn(async (params: { lookup_key: string }) => ({ id: `price_${params.lookup_key}` })),
    },
    customers: {
      list: vi.fn(async () => ({ data: [] as { id: string }[] })),
      create: vi.fn(async () => ({ id: 'cus_new' })),
    },
    checkout: { sessions: { create: vi.fn(async (_params: Record<string, unknown>) => ({ url: 'https://checkout.stripe.test/session' })) } },
  }
}

const SUB_ID = 'sub_1'
const subscription = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: SUB_ID,
  status: 'active',
  created: 1_790_000_000,
  customer: 'cus_1',
  cancel_at_period_end: false,
  pause_collection: null,
  trial_end: null,
  current_period_end: 1_792_592_000,
  metadata: { shopSubscription: '1', shopProductId: '7', userId: '3', customerEmail: 'buyer@example.com', productName: 'Coffee box', paymentsLimit: '0' },
  items: { data: [{ current_period_end: 1_792_592_000, price: { id: 'price_x', currency: 'aud', unit_amount: 2500, recurring: { interval: 'month', interval_count: 1 } } }] },
  ...over,
})

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'in_1',
  subscription: SUB_ID,
  amount_paid: 2500,
  currency: 'aud',
  billing_reason: 'subscription_create',
  lines: { data: [{ description: 'Coffee box', amount: 2500 }] },
  ...over,
})

const NOW = () => new Date('2026-10-28T09:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('plan rules', () => {
  it('fills a missing plan with the defaults and reads numbers that arrive as text', () => {
    expect(normalisePlan(undefined)).toEqual({ enabled: false, interval: 'month', intervalCount: 1, trialDays: 0, signupFee: 0, paymentsLimit: 0 })
    expect(normalisePlan({ enabled: true, interval: 'week', intervalCount: '2', trialDays: '14', signupFee: '9.5', paymentsLimit: 6 })).toMatchObject({ enabled: true, interval: 'week', intervalCount: 2, trialDays: 14, signupFee: 9.5, paymentsLimit: 6 })
    expect(normalisePlan({ enabled: true, interval: 'fortnight' }).interval).toBe('month')
  })

  it('explains what is wrong, only when the plan is on', () => {
    expect(planProblems(normalisePlan({ enabled: false, intervalCount: 99 }))).toEqual([])
    expect(planProblems(normalisePlan({ enabled: true, interval: 'year', intervalCount: 2 }))[0]).toMatch(/once a year/)
    expect(planProblems(normalisePlan({ enabled: true, interval: 'month', intervalCount: 13 }))[0]).toMatch(/1 to 12/)
    expect(planProblems(normalisePlan({ enabled: true, interval: 'month', intervalCount: 1, trialDays: 400 }))[0]).toMatch(/Free trial/)
    expect(planProblems(normalisePlan({ enabled: true, interval: 'month', intervalCount: 1 }))).toEqual([])
  })

  it('reads plainly', () => {
    expect(intervalPhrase('month', 1)).toBe('every month')
    expect(intervalPhrase('week', 2)).toBe('every 2 weeks')
  })
})

describe('Stripe helpers', () => {
  it('builds stable lookup keys so one amount is one price', () => {
    expect(recurringLookupKey(7, 'AUD', 2500, 'month', 1)).toBe('shop_sub_p7_aud_2500_month1')
    expect(feeLookupKey(7, 'AUD', 900)).toBe('shop_sub_fee_p7_aud_900')
  })

  it('maps Stripe statuses, reading pause and cancellation from their own fields', () => {
    expect(statusFromStripe({ status: 'active' })).toBe('active')
    expect(statusFromStripe({ status: 'active', pause_collection: { behavior: 'void' } })).toBe('paused')
    expect(statusFromStripe({ status: 'active', cancel_at_period_end: true })).toBe('cancelling')
    expect(statusFromStripe({ status: 'trialing' })).toBe('trialing')
    expect(statusFromStripe({ status: 'past_due' })).toBe('past-due')
    expect(statusFromStripe({ status: 'canceled' })).toBe('cancelled')
    expect(statusFromStripe({ status: 'incomplete' })).toBe('incomplete')
  })

  it('finds the subscription on an invoice in either place Stripe has used', () => {
    expect(subscriptionIdOf({ subscription: 'sub_a' })).toBe('sub_a')
    expect(subscriptionIdOf({ parent: { subscription_details: { subscription: 'sub_b' } } })).toBe('sub_b')
    expect(subscriptionIdOf({})).toBeNull()
  })

  it('reads the period end from the subscription or its first item', () => {
    expect(periodEndOf({ current_period_end: 1_700_000_000 })).toBe('2023-11-14T22:13:20.000Z')
    expect(periodEndOf({ items: { data: [{ current_period_end: 1_700_000_000 }] } })).toBe('2023-11-14T22:13:20.000Z')
    expect(periodEndOf({})).toBeNull()
  })

  it('creates a price once and reuses it, and recovers when a parallel request got there first', async () => {
    const stripe = fakeStripe({})
    const args = { productId: 7, title: 'Coffee box', currency: 'AUD', amountCents: 2500, interval: 'month' as const, intervalCount: 1 }
    const first = await ensureRecurringPrice(stripe as never, args)
    expect(first).toBe('price_shop_sub_p7_aud_2500_month1')
    expect(stripe.prices.create).toHaveBeenCalledTimes(1)

    stripe.prices.list.mockResolvedValueOnce({ data: [{ id: 'price_existing' }] })
    expect(await ensureRecurringPrice(stripe as never, args)).toBe('price_existing')
    expect(stripe.prices.create).toHaveBeenCalledTimes(1)

    stripe.prices.list.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [{ id: 'price_raced' }] })
    stripe.prices.create.mockRejectedValueOnce(new Error('lookup key taken'))
    expect(await ensureRecurringPrice(stripe as never, args)).toBe('price_raced')
  })
})

describe('webhooks', () => {
  it('a checkout that completes creates the subscription and sends the started email', async () => {
    const engine = fakeEngine()
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    const handled = await handleShopSubscriptionEvent({ engine: engine as never, stripe: stripe as never, now: NOW }, {
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: SUB_ID, metadata: { shopSubscription: '1' } } },
    })
    expect(handled).toBe(true)
    const [record] = engine.tables['product-subscriptions']
    expect(record).toMatchObject({ customer: 3, customerEmail: 'buyer@example.com', product: 7, productName: 'Coffee box', status: 'active', amountCents: 2500, billingInterval: 'month', paymentsMade: 0, stripeSubscriptionId: SUB_ID })
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ template: 'subscription.new', to: 'buyer@example.com' }))
  })

  it('the first paid invoice becomes one paid order, and a replayed event does not make another', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'buyer@example.com', product: 7, productName: 'Coffee box', status: 'incomplete', paymentsMade: 0, paymentsLimit: 0, stripeSubscriptionId: SUB_ID, history: [] }] })
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    const deps = { engine: engine as never, stripe: stripe as never, now: NOW }
    const event = { type: 'invoice.paid', data: { object: invoice() } }

    await handleShopSubscriptionEvent(deps, event)
    await handleShopSubscriptionEvent(deps, event)

    expect(engine.tables.orders).toHaveLength(1)
    expect(engine.tables.orders[0]).toMatchObject({ status: 'processing', amount: 2500, currency: 'AUD', customer: 3, customerEmail: 'buyer@example.com' })
    const record = engine.tables['product-subscriptions'][0]
    expect(record).toMatchObject({ paymentsMade: 1, status: 'active' })
    expect((record.history as { invoiceId?: string }[]).filter((h) => h.invoiceId === 'in_1')).toHaveLength(1)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  })

  it('a renewal makes an order and sends the payment received email', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'buyer@example.com', product: 7, productName: 'Coffee box', status: 'active', paymentsMade: 1, paymentsLimit: 0, stripeSubscriptionId: SUB_ID, history: [] }] })
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    await handleShopSubscriptionEvent({ engine: engine as never, stripe: stripe as never, now: NOW }, { type: 'invoice.paid', data: { object: invoice({ id: 'in_2', billing_reason: 'subscription_cycle' }) } })
    expect(engine.tables.orders).toHaveLength(1)
    expect(engine.tables['product-subscriptions'][0].paymentsMade).toBe(2)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ template: 'subscription.renewal' }))
  })

  it('a free trial invoice of nothing makes no order', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'b@example.com', product: 7, productName: 'Box', status: 'trialing', paymentsMade: 0, paymentsLimit: 0, stripeSubscriptionId: SUB_ID, history: [] }] })
    const stripe = fakeStripe({ [SUB_ID]: subscription({ status: 'trialing' }) })
    await handleShopSubscriptionEvent({ engine: engine as never, stripe: stripe as never, now: NOW }, { type: 'invoice.paid', data: { object: invoice({ id: 'in_0', amount_paid: 0 }) } })
    expect(engine.tables.orders).toHaveLength(0)
    expect(engine.tables['product-subscriptions'][0].paymentsMade).toBe(0)
  })

  it('stops the subscription at the end of the period once the payment limit is reached', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'b@example.com', product: 7, productName: 'Box', status: 'active', paymentsMade: 1, paymentsLimit: 2, stripeSubscriptionId: SUB_ID, history: [] }] })
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    await handleShopSubscriptionEvent({ engine: engine as never, stripe: stripe as never, now: NOW }, { type: 'invoice.paid', data: { object: invoice({ id: 'in_2', billing_reason: 'subscription_cycle' }) } })
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(SUB_ID, { cancel_at_period_end: true })
    expect(engine.tables['product-subscriptions'][0]).toMatchObject({ status: 'cancelling', paymentsMade: 2 })
  })

  it('a failed payment marks the subscription past due and emails the customer', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'b@example.com', product: 7, productName: 'Box', status: 'active', stripeSubscriptionId: SUB_ID, history: [] }] })
    await handleShopSubscriptionEvent({ engine: engine as never, stripe: fakeStripe({}) as never, now: NOW }, { type: 'invoice.payment_failed', data: { object: invoice({ id: 'in_9' }) } })
    expect(engine.tables['product-subscriptions'][0].status).toBe('past-due')
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(expect.objectContaining({ template: 'subscription.failed' }))
  })

  it('an ended subscription is marked ended once, with one cancelled email', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [{ id: 1, customer: 3, customerEmail: 'b@example.com', product: 7, productName: 'Box', status: 'cancelling', stripeSubscriptionId: SUB_ID, history: [] }] })
    const deps = { engine: engine as never, stripe: fakeStripe({}) as never, now: NOW }
    const event = { type: 'customer.subscription.deleted', data: { object: subscription({ status: 'canceled' }) } }
    await handleShopSubscriptionEvent(deps, event)
    await handleShopSubscriptionEvent(deps, event)
    expect(engine.tables['product-subscriptions'][0]).toMatchObject({ status: 'cancelled' })
    expect(vi.mocked(sendEmail).mock.calls.filter(([args]) => (args as { template?: string }).template === 'subscription.cancelled')).toHaveLength(1)
  })

  it('leaves membership subscriptions alone', async () => {
    const engine = fakeEngine()
    const membership = subscription({ id: 'sub_member', metadata: { membershipId: '4' } })
    const stripe = fakeStripe({ sub_member: membership })
    const handled = await handleShopSubscriptionEvent({ engine: engine as never, stripe: stripe as never, now: NOW }, { type: 'invoice.paid', data: { object: invoice({ subscription: 'sub_member' }) } })
    expect(handled).toBe(false)
    expect(engine.tables['product-subscriptions']).toHaveLength(0)
    expect(engine.tables.orders).toHaveLength(0)
  })
})

describe('customer and staff changes', () => {
  const row = (over: Record<string, unknown> = {}) => ({ id: 1, customer: 3, customerEmail: 'b@example.com', product: 7, productName: 'Box', status: 'active', stripeSubscriptionId: SUB_ID, history: [] as unknown[], ...over })

  it('will not change someone else\'s subscription, and says it cannot be found', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [row()] })
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    const result = await manageSubscription({ engine: engine as never, stripe: stripe as never, now: NOW }, { id: 1, action: 'cancel', actor: { by: 'customer', userId: 99 } })
    expect(result).toEqual({ ok: false, error: 'That subscription could not be found.' })
    expect(stripe.subscriptions.update).not.toHaveBeenCalled()
  })

  it('pauses from the next payment and resumes', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [row()] })
    const stripe = fakeStripe({ [SUB_ID]: subscription() })
    const paused = await manageSubscription({ engine: engine as never, stripe: stripe as never, now: NOW }, { id: 1, action: 'pause', actor: { by: 'customer', userId: 3 } })
    expect(paused).toEqual({ ok: true, status: 'paused' })
    expect(stripe.subscriptions.update).toHaveBeenLastCalledWith(SUB_ID, { pause_collection: { behavior: 'void' } })
    const resumed = await manageSubscription({ engine: engine as never, stripe: stripe as never, now: NOW }, { id: 1, action: 'resume', actor: { by: 'customer', userId: 3 } })
    expect(resumed).toEqual({ ok: true, status: 'active' })
    expect(stripe.subscriptions.update).toHaveBeenLastCalledWith(SUB_ID, { pause_collection: '' })
  })

  it('cancels at the end of the period, and refuses a cancel once it has ended', async () => {
    const engine = fakeEngine({}, { 'product-subscriptions': [row(), row({ id: 2, status: 'cancelled', stripeSubscriptionId: 'sub_old' })] })
    const stripe = fakeStripe({ [SUB_ID]: subscription(), sub_old: subscription({ id: 'sub_old' }) })
    const done = await manageSubscription({ engine: engine as never, stripe: stripe as never, now: NOW }, { id: 1, action: 'cancel', actor: { by: 'staff' } })
    expect(done).toEqual({ ok: true, status: 'cancelling' })
    expect(engine.tables['product-subscriptions'][0].cancelledAt).toBe(NOW().toISOString())
    const refused = await manageSubscription({ engine: engine as never, stripe: stripe as never, now: NOW }, { id: 2, action: 'cancel', actor: { by: 'staff' } })
    expect(refused.ok).toBe(false)
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1)
  })
})

describe('starting a subscription', () => {
  const product = { id: 7, title: 'Coffee box', slug: 'coffee-box', productType: 'simple', subscription: { enabled: true, interval: 'month', intervalCount: 1, trialDays: 7, signupFee: 5, paymentsLimit: 0 } }
  const globals = {
    'shop-extra-settings': { subscriptionsEnabled: true },
    'payment-settings': { stripe: { enabled: true, secretKey: 'sk_test_fake' } },
  }

  it('is refused while Subscriptions is switched off', async () => {
    const engine = fakeEngine({ 'shop-extra-settings': { subscriptionsEnabled: false }, 'payment-settings': globals['payment-settings'] })
    const result = await startSubscriptionCheckout({ engine: engine as never, user: { id: 3, email: 'b@example.com' }, product, origin: 'https://shop.test', client: fakeStripe({}) as never })
    expect(result).toEqual({ ok: false, error: 'Subscriptions are not switched on in this shop.' })
  })

  it('is refused when the product has no plan', async () => {
    const engine = fakeEngine(globals)
    const result = await startSubscriptionCheckout({ engine: engine as never, user: { id: 3, email: 'b@example.com' }, product: { ...product, subscription: undefined }, origin: 'https://shop.test', client: fakeStripe({}) as never })
    expect(result).toEqual({ ok: false, error: 'This product is not sold as a subscription.' })
  })

  it('creates the Stripe prices and returns a checkout address with the trial and metadata', async () => {
    const engine = fakeEngine(globals)
    const stripe = fakeStripe({})
    const result = await startSubscriptionCheckout({ engine: engine as never, user: { id: 3, email: 'b@example.com' }, product, origin: 'https://shop.test', client: stripe as never })
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/session' })
    const params = stripe.checkout.sessions.create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(params).toMatchObject({ mode: 'subscription', customer: 'cus_new', success_url: 'https://shop.test/account/subscriptions?started=1', cancel_url: 'https://shop.test/shop/coffee-box' })
    expect(params.line_items).toEqual([
      { price: 'price_shop_sub_p7_aud_2500_month1', quantity: 1 },
      { price: 'price_shop_sub_fee_p7_aud_500', quantity: 1 },
    ])
    expect(params.subscription_data).toMatchObject({ trial_period_days: 7, metadata: expect.objectContaining({ shopSubscription: '1', shopProductId: '7', userId: '3' }) })
  })
})
