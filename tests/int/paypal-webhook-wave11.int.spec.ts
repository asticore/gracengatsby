// @vitest-environment node
// PayPal webhook, with PayPal's verify call and the order helpers mocked. Nothing here reaches PayPal or D1.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearPayPalTokenCache } from '@/features/ecommerce/payments/paypalAdapter'
import { handlePayPalWebhook, type WebhookSettings } from '@/features/ecommerce/payments/paypalWebhook'
import * as orders from '@/features/ecommerce/server/orders'

vi.mock('@/features/ecommerce/server/orders', () => ({
  addOrderNote: vi.fn(),
  flagAttention: vi.fn(),
  flagMismatch: vi.fn(),
  markOrderFailed: vi.fn(),
  markOrderPaid: vi.fn(),
}))

const SETTINGS: WebhookSettings = { clientId: 'client-abc', clientSecret: 'secret-xyz', environment: 'sandbox', webhookId: 'WH-TEST-1' }
const PAYPAL_ORDER = 'PAYORDER123456'
const CERT = 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT1'

type Row = Record<string, unknown> & { id: number; notes: Array<{ text: string }> }

/** A pending shop order of 50.00 AUD with its PayPal order id. */
function freshOrder(): Row {
  return { id: 42, amount: 5000, currency: 'AUD', giftCardTotal: 0, storeCreditTotal: 0, status: 'pending', paidAt: null, paypalOrderId: PAYPAL_ORDER, paypalCaptureId: null, notes: [] }
}

let order: Row
let verdict: 'SUCCESS' | 'FAILURE'
let verifyBodies: Record<string, unknown>[]

/** Stands in for PayPal: a token, and the signature verdict the test chooses. */
function paypalFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
    if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
      verifyBodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ verification_status: verdict }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
}

/** The shop engine, reduced to the calls the webhook makes: find orders by PayPal ids, and update one. */
const engine = {
  find: async ({ collection, where }: { collection: string; where: Record<string, { equals: unknown }> }) => {
    if (collection !== 'orders') return { docs: [] }
    const hit = Object.entries(where).every(([field, cond]) => (order as Record<string, unknown>)[field] === cond.equals)
    return { docs: hit ? [{ ...order }] : [] }
  },
  update: async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(order, data)
    return order
  },
}

function deliver(event: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request = {
    headers: new Headers({
      'paypal-cert-url': CERT,
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-time': '2026-10-20T10:00:00Z',
      'paypal-transmission-sig': 'sig-1',
      ...headers,
    }),
    rawBody: JSON.stringify(event),
  }
  return handlePayPalWebhook(engine as never, SETTINGS, request, { fetch: paypalFetch() })
}

const capture = (over: { id?: string; status?: string; value?: string; currency?: string; orderId?: string | null } = {}) => ({
  id: 'EVT-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: over.id ?? 'CAP1ABCDE',
    status: over.status ?? 'COMPLETED',
    amount: { value: over.value ?? '50.00', currency_code: over.currency ?? 'AUD' },
    supplementary_data: { related_ids: { order_id: over.orderId === undefined ? PAYPAL_ORDER : over.orderId } },
  },
})

beforeEach(() => {
  clearPayPalTokenCache()
  vi.clearAllMocks()
  order = freshOrder()
  verdict = 'SUCCESS'
  verifyBodies = []
  // The order helpers record what they were asked to do, so the webhook's effects are visible on the order.
  vi.mocked(orders.markOrderPaid).mockImplementation((async (_e: unknown, _id: number, info: { paymentIntentId?: string }) => {
    if (!order.paidAt) order.status = 'processing'
    order.paidAt = order.paidAt ?? '2026-10-20T10:00:00Z'
    order.paymentIntentId = info.paymentIntentId
  }) as never)
  vi.mocked(orders.flagMismatch).mockImplementation(async () => {
    if (order.status === 'pending' || order.status === 'failed') order.status = 'on-hold'
  })
  vi.mocked(orders.addOrderNote).mockImplementation(async (_e, _id, note) => {
    order.notes.push({ text: note.text })
    return null
  })
  vi.mocked(orders.markOrderFailed).mockImplementation(async () => {
    if (order.status === 'pending') order.status = 'failed'
  })
})

describe('PayPal webhook signature', () => {
  it('rejects a bad signature and changes nothing', async () => {
    verdict = 'FAILURE'
    const result = await deliver(capture())
    expect(result.status).toBe(400)
    expect(verifyBodies).toHaveLength(1)
    expect(orders.markOrderPaid).not.toHaveBeenCalled()
    expect(order.status).toBe('pending')
  })

  it('sends the saved webhook id and the signed event to PayPal', async () => {
    await deliver(capture())
    expect(verifyBodies[0]).toMatchObject({ webhook_id: 'WH-TEST-1', transmission_id: 'tx-1', transmission_sig: 'sig-1', cert_url: CERT })
    expect((verifyBodies[0].webhook_event as { event_type: string }).event_type).toBe('PAYMENT.CAPTURE.COMPLETED')
  })

  it('refuses a certificate address that is not on paypal.com, before calling PayPal', async () => {
    const result = await deliver(capture(), { 'paypal-cert-url': 'https://evil.example.com/cert' })
    expect(result.status).toBe(400)
    expect(verifyBodies).toHaveLength(0)
  })

  it('answers 503 while no webhook id is saved, and does not call PayPal', async () => {
    const result = await handlePayPalWebhook(engine as never, { ...SETTINGS, webhookId: '' }, { headers: new Headers(), rawBody: JSON.stringify(capture()) }, { fetch: paypalFetch() })
    expect(result.status).toBe(503)
    expect(verifyBodies).toHaveLength(0)
  })

  it('acknowledges an event the shop does not use without calling PayPal', async () => {
    const result = await deliver({ id: 'EVT-9', event_type: 'BILLING.SUBSCRIPTION.CREATED', resource: {} })
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(verifyBodies).toHaveLength(0)
  })
})

describe('PAYMENT.CAPTURE.COMPLETED', () => {
  it('marks a matching order paid once', async () => {
    const result = await deliver(capture())
    expect(result.status).toBe(200)
    expect(orders.markOrderPaid).toHaveBeenCalledTimes(1)
    expect(order).toMatchObject({ status: 'processing', paypalCaptureId: 'CAP1ABCDE', paymentIntentId: 'CAP1ABCDE' })
  })

  it('is idempotent: a repeat delivery leaves the order as it was, with no hold and no second payment', async () => {
    await deliver(capture())
    const afterFirst: Row = { ...order, notes: [...order.notes] }
    const repeat = await deliver(capture())
    expect(repeat.status).toBe(200)
    expect(order).toMatchObject({ status: afterFirst.status, paidAt: afterFirst.paidAt, paypalCaptureId: 'CAP1ABCDE' })
    expect(orders.flagMismatch).not.toHaveBeenCalled()
    expect(order.notes).toEqual([])
  })

  it('holds the order when PayPal took a different amount, and marks nothing paid', async () => {
    const result = await deliver(capture({ value: '40.00' }))
    expect(result.status).toBe(200)
    expect(orders.flagMismatch).toHaveBeenCalledTimes(1)
    expect(orders.markOrderPaid).not.toHaveBeenCalled()
    expect(order.status).toBe('on-hold')
    expect(order.paidAt).toBeNull()
  })

  it('holds the order when the currency differs', async () => {
    await deliver(capture({ currency: 'USD' }))
    expect(orders.markOrderPaid).not.toHaveBeenCalled()
    expect(order.status).toBe('on-hold')
  })

  it('ignores a completed event for an order it cannot find', async () => {
    const result = await deliver(capture({ orderId: 'NOSUCHORDER1' , id: 'CAP404XYZ' }))
    expect(result.status).toBe(200)
    expect(orders.markOrderPaid).not.toHaveBeenCalled()
  })
})

describe('PAYMENT.CAPTURE.DENIED and REFUNDED', () => {
  it('fails an unpaid order once, and notes it', async () => {
    const denied = { id: 'EVT-2', event_type: 'PAYMENT.CAPTURE.DENIED', resource: { id: 'CAP1ABCDE', status: 'DENIED', supplementary_data: { related_ids: { order_id: PAYPAL_ORDER } } } }
    await deliver(denied)
    expect(orders.markOrderFailed).toHaveBeenCalledTimes(1)
    expect(order.notes).toHaveLength(1)
    await deliver(denied)
    expect(order.notes).toHaveLength(1)
  })

  it('flags a paid order for staff instead of changing its status', async () => {
    order.paidAt = '2026-10-19T10:00:00Z'
    order.status = 'processing'
    await deliver({ id: 'EVT-3', event_type: 'PAYMENT.CAPTURE.DECLINED', resource: { id: 'CAP1ABCDE', status: 'DECLINED', supplementary_data: { related_ids: { order_id: PAYPAL_ORDER } } } })
    expect(orders.flagAttention).toHaveBeenCalledTimes(1)
    expect(orders.markOrderFailed).not.toHaveBeenCalled()
    expect(order.status).toBe('processing')
  })

  it('records a refund as a note only: no payment, status or stock change', async () => {
    order.paidAt = '2026-10-19T10:00:00Z'
    order.status = 'processing'
    order.paypalCaptureId = 'CAP1ABCDE'
    const refund = {
      id: 'EVT-4',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'REF-1', status: 'COMPLETED', amount: { value: '10.00', currency_code: 'AUD' }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP1ABCDE' }] },
    }
    const result = await deliver(refund)
    expect(result.status).toBe(200)
    expect(orders.addOrderNote).toHaveBeenCalledTimes(1)
    expect(order.notes[0].text).toContain('recorded only')
    expect(orders.markOrderPaid).not.toHaveBeenCalled()
    expect(orders.markOrderFailed).not.toHaveBeenCalled()
    expect(order.status).toBe('processing')
    await deliver(refund)
    expect(orders.addOrderNote).toHaveBeenCalledTimes(1)
  })
})
