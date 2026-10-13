// @vitest-environment node
// PayPal checkout, tested with a mocked fetch (PayPal cannot be reached from the build sandbox).
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { publicPaymentConfig } from '@/features/ecommerce/lib/paymentMethods'
import {
  clearPayPalTokenCache,
  createPayPalAdapter,
  formatPayPalAmount,
  getAccessToken,
  parsePayPalAmount,
  PayPalError,
  type PayPalSettings,
} from '@/features/ecommerce/payments/paypalAdapter'
import { settlePayPalCapture, type PayPalOrderRow, type SettleDeps } from '@/features/ecommerce/payments/paypalCheckout'

const SETTINGS: PayPalSettings = { clientId: 'client-abc', clientSecret: 'secret-xyz', environment: 'sandbox' }
const ORDER_ID = 'ORDER1234567'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tokenResponse = (expiresIn = 3600) => json({ access_token: 'tok-1', expires_in: expiresIn })
const completedCapture = (amount = '12.34', currency = 'AUD', captureId = 'CAP1') => ({
  id: ORDER_ID,
  status: 'COMPLETED',
  purchase_units: [{ payments: { captures: [{ id: captureId, status: 'COMPLETED', amount: { value: amount, currency_code: currency } }] } }],
})

/** A fetch double that records every call and answers by URL. */
function mockPayPal(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return handler(url, init ?? {})
  })
  return { fetch: fetchMock as unknown as typeof fetch, calls, fetchMock }
}

const countCalls = (calls: { url: string; init: RequestInit }[], method: string, path: string) =>
  calls.filter((c) => (c.init.method ?? 'GET') === method && c.url.endsWith(path)).length

beforeEach(() => {
  clearPayPalTokenCache()
})

describe('PayPal access token', () => {
  it('is cached and reused until shortly before it expires', async () => {
    let t = 1_000_000
    const now = () => t
    const pp = mockPayPal((url) => (url.endsWith('/v1/oauth2/token') ? tokenResponse(3600) : json({}, 404)))

    expect(await getAccessToken(SETTINGS, { fetch: pp.fetch, now })).toBe('tok-1')
    expect(await getAccessToken(SETTINGS, { fetch: pp.fetch, now })).toBe('tok-1')
    expect(pp.fetchMock).toHaveBeenCalledTimes(1)

    // Still cached just before the one-minute safety margin...
    t += (3600 - 61) * 1000
    await getAccessToken(SETTINGS, { fetch: pp.fetch, now })
    expect(pp.fetchMock).toHaveBeenCalledTimes(1)

    // ...and fetched again once it is inside that margin.
    t += 2_000
    await getAccessToken(SETTINGS, { fetch: pp.fetch, now })
    expect(pp.fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the sandbox host unless the environment is live', async () => {
    const pp = mockPayPal(() => tokenResponse())
    await getAccessToken(SETTINGS, { fetch: pp.fetch })
    expect(pp.calls[0].url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token')
    clearPayPalTokenCache()
    await getAccessToken({ ...SETTINGS, environment: 'live' }, { fetch: pp.fetch })
    expect(pp.calls[1].url).toBe('https://api-m.paypal.com/v1/oauth2/token')
  })

  it('reports a refused key without the secret', async () => {
    const pp = mockPayPal(() => json({ error: 'invalid_client' }, 401))
    const error = await getAccessToken(SETTINGS, { fetch: pp.fetch }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PayPalError)
    expect((error as Error).message).toContain('401')
    expect((error as Error).message).not.toContain('secret-xyz')
  })
})

describe('PayPal orders', () => {
  it('creates an order for the exact amount, in the order currency', async () => {
    const pp = mockPayPal((url) => (url.endsWith('/v1/oauth2/token') ? tokenResponse() : json({ id: ORDER_ID, status: 'CREATED' }, 201)))
    const adapter = createPayPalAdapter(SETTINGS, { fetch: pp.fetch })
    expect(await adapter.createOrder(1234, 'AUD', 'cart-7')).toEqual({ id: ORDER_ID, status: 'CREATED' })

    const create = pp.calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!
    const body = JSON.parse(String(create.init.body))
    expect(body.intent).toBe('CAPTURE')
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'AUD', value: '12.34' })
    expect((create.init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
  })

  it('refuses a non-positive or fractional amount before calling PayPal', async () => {
    const pp = mockPayPal(() => tokenResponse())
    const adapter = createPayPalAdapter(SETTINGS, { fetch: pp.fetch })
    await expect(adapter.createOrder(0, 'AUD', 'cart-1')).rejects.toBeInstanceOf(PayPalError)
    await expect(adapter.createOrder(12.5, 'AUD', 'cart-1')).rejects.toBeInstanceOf(PayPalError)
    expect(pp.fetchMock).not.toHaveBeenCalled()
  })

  it('captures and reads back the captured amount, currency and capture id', async () => {
    const pp = mockPayPal((url) => (url.endsWith('/v1/oauth2/token') ? tokenResponse() : json(completedCapture())))
    const capture = await createPayPalAdapter(SETTINGS, { fetch: pp.fetch }).captureOrder(ORDER_ID)
    expect(capture).toEqual({ status: 'COMPLETED', captureId: 'CAP1', captureStatus: 'COMPLETED', amountCents: 1234, currency: 'AUD' })
    const call = pp.calls.find((c) => c.url.endsWith(`/v2/checkout/orders/${ORDER_ID}/capture`))!
    expect((call.init.headers as Record<string, string>)['PayPal-Request-Id']).toBe(`capture-${ORDER_ID}`)
  })

  it('reads the recorded capture when PayPal says the order was already captured', async () => {
    const pp = mockPayPal((url, init) => {
      if (url.endsWith('/v1/oauth2/token')) return tokenResponse()
      if (init.method === 'POST') return json({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, 422)
      return json(completedCapture())
    })
    const capture = await createPayPalAdapter(SETTINGS, { fetch: pp.fetch }).captureOrder(ORDER_ID)
    expect(capture.captureId).toBe('CAP1')
    expect(countCalls(pp.calls, 'GET', `/v2/checkout/orders/${ORDER_ID}`)).toBe(1)
  })

  it('converts amounts with integer arithmetic only', () => {
    expect(parsePayPalAmount('12.5')).toBe(1250)
    expect(parsePayPalAmount('0.07')).toBe(7)
    expect(parsePayPalAmount('12')).toBe(1200)
    expect(parsePayPalAmount('1.234')).toBeNull()
    expect(parsePayPalAmount('abc')).toBeNull()
    expect(formatPayPalAmount(1205)).toBe('12.05')
    expect(formatPayPalAmount(7)).toBe('0.07')
  })
})

describe('settling a PayPal capture against the order', () => {
  const order: PayPalOrderRow = { id: 42, amount: 5000, currency: 'AUD', giftCardTotal: 0, storeCreditTotal: 0, status: 'pending', paidAt: null, paypalCaptureId: null }

  function deps(capture: Partial<Awaited<ReturnType<SettleDeps['capture']>>> | 'throw'): SettleDeps & { saved: string[]; marked: string[]; flagged: string[] } {
    const saved: string[] = []
    const marked: string[] = []
    const flagged: string[] = []
    return {
      saved,
      marked,
      flagged,
      capture: async () => {
        if (capture === 'throw') throw new PayPalError('PayPal refused the request (422: INSTRUMENT_DECLINED).', 'INSTRUMENT_DECLINED')
        return { status: 'COMPLETED', captureId: 'CAP1', captureStatus: 'COMPLETED', amountCents: 5000, currency: 'AUD', ...capture }
      },
      saveCaptureId: async (id) => {
        saved.push(id)
      },
      markPaid: async (id) => {
        marked.push(id)
      },
      flagMismatch: async (text) => {
        flagged.push(text)
      },
    }
  }

  it('marks a matching capture paid', async () => {
    const d = deps({})
    expect(await settlePayPalCapture(order, d)).toEqual({ ok: true, alreadyPaid: false })
    expect(d.saved).toEqual(['CAP1'])
    expect(d.marked).toEqual(['CAP1'])
    expect(d.flagged).toEqual([])
  })

  it('rejects an amount that does not match and holds the order for staff', async () => {
    const d = deps({ amountCents: 4999 })
    const result = await settlePayPalCapture(order, d)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(d.marked).toEqual([])
    expect(d.saved).toEqual(['CAP1'])
    expect(d.flagged).toHaveLength(1)
    expect(d.flagged[0]).toContain('CAP1')
  })

  it('rejects a currency that does not match', async () => {
    const d = deps({ currency: 'USD' })
    expect(await settlePayPalCapture(order, d)).toMatchObject({ ok: false, status: 400 })
    expect(d.marked).toEqual([])
    expect(d.flagged).toHaveLength(1)
  })

  it('takes gift cards and store credit off the amount the card must pay', async () => {
    const d = deps({ amountCents: 3500 })
    const paid = { ...order, giftCardTotal: 1000, storeCreditTotal: 500 }
    expect(await settlePayPalCapture(paid, d)).toEqual({ ok: true, alreadyPaid: false })
  })

  it('does not mark a capture PayPal is still holding as paid', async () => {
    const d = deps({ captureStatus: 'PENDING' })
    expect(await settlePayPalCapture(order, d)).toMatchObject({ ok: false, status: 409 })
    expect(d.marked).toEqual([])
  })

  it('turns a PayPal refusal into a plain message', async () => {
    const d = deps('throw')
    expect(await settlePayPalCapture(order, d)).toMatchObject({ ok: false, status: 402 })
    expect(d.marked).toEqual([])
  })

  it('does not capture again an order that is already settled', async () => {
    const capture = vi.fn()
    const d = { ...deps({}), capture }
    const settled = { ...order, status: 'processing', paidAt: '2026-10-13T00:00:00Z', paypalCaptureId: 'CAP1' }
    expect(await settlePayPalCapture(settled, d)).toEqual({ ok: true, alreadyPaid: true })
    expect(capture).not.toHaveBeenCalled()
    expect(d.marked).toEqual(['CAP1'])
  })

  it('does not capture again an order that staff are already reviewing', async () => {
    const capture = vi.fn()
    const d = { ...deps({}), capture }
    const held = { ...order, status: 'on-hold', paypalCaptureId: 'CAP1' }
    expect(await settlePayPalCapture(held, d)).toMatchObject({ ok: false, status: 409 })
    expect(capture).not.toHaveBeenCalled()
  })
})

describe('one PayPal order captured twice', () => {
  it('marks the shop order paid exactly once, including after a crash between capture and save', async () => {
    let captures = 0
    const pp = mockPayPal((url, init) => {
      if (url.endsWith('/v1/oauth2/token')) return tokenResponse()
      if (init.method === 'POST') {
        captures += 1
        return captures === 1 ? json(completedCapture()) : json({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, 422)
      }
      return json(completedCapture())
    })
    const adapter = createPayPalAdapter(SETTINGS, { fetch: pp.fetch })
    const state: PayPalOrderRow = { id: 42, amount: 1234, currency: 'AUD', status: 'pending', paidAt: null, paypalCaptureId: null }
    let paidCount = 0
    const run = () =>
      settlePayPalCapture(state, {
        capture: () => adapter.captureOrder(ORDER_ID),
        saveCaptureId: async (id) => {
          state.paypalCaptureId = id
        },
        markPaid: async () => {
          if (!state.paidAt) paidCount += 1
          state.paidAt = state.paidAt ?? '2026-10-13T00:00:00Z'
          state.status = 'processing'
        },
        flagMismatch: async () => {
          throw new Error('should not flag')
        },
      })

    expect(await run()).toEqual({ ok: true, alreadyPaid: false })
    expect(await run()).toEqual({ ok: true, alreadyPaid: true })
    expect(captures).toBe(1)

    // Crash case: capture id saved, paid flag never written. The retry must finish the job without a second charge.
    state.paidAt = null
    state.status = 'pending'
    expect(await run()).toEqual({ ok: true, alreadyPaid: false })
    expect(captures).toBe(2)
    expect(paidCount).toBe(2)
    expect(state.paidAt).not.toBeNull()
  })
})

describe('public PayPal config', () => {
  it('exposes only enabled, client id and environment, and never the secret', () => {
    const cfg = publicPaymentConfig({ paypal: { enabled: true, clientId: 'client-abc', clientSecret: 'secret-xyz', environment: 'live' } } as never, 'AUD')
    expect(cfg.paypal).toEqual({ enabled: true, clientId: 'client-abc', environment: 'live' })
    expect(JSON.stringify(cfg)).not.toContain('secret-xyz')
  })

  it('stays off without a secret, and hides the client id while off', () => {
    const cfg = publicPaymentConfig({ paypal: { enabled: true, clientId: 'client-abc', clientSecret: '' } } as never, 'AUD')
    expect(cfg.paypal).toEqual({ enabled: false, clientId: '', environment: 'sandbox' })
    expect(publicPaymentConfig(null, 'AUD').paypal.enabled).toBe(false)
  })
})
