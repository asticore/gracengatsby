// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AusPostAdapter } from '@/features/ecommerce/shipping/auspost'
import {
  AUSPOST_SHIPPING_BASE,
  buildLabelBody,
  buildShipmentBody,
  checkAusPostAccount,
  createAusPostLabel,
  parseLabelRequestId,
  parseLabelUrl,
  parseShipmentResponse,
  productIdFor,
  type JsonSend,
} from '@/features/ecommerce/shipping/auspost-labels'
import { carrierDef, carrierLabelsReady } from '@/features/ecommerce/shipping/catalogue'
import { http } from '@/features/ecommerce/shipping/http'
import type { LabelRequest } from '@/features/ecommerce/shipping/types'

const origin = { name: 'Gracen Shop', company: 'Gracen', line1: '1 George St', city: 'Sydney', state: 'nsw', postcode: '2000', country: 'AU', phone: '0400 000 000' }
const destination = { name: 'Al Buyer', line1: '2 Hay St', line2: 'Unit 4', city: 'Perth', state: 'WA', postcode: '6000', country: 'au', email: 'al@example.com' }
const oneParcel = [{ weightKg: 1.234, lengthCm: 20.4, widthCm: 10, heightCm: 5.6 }]
const request: LabelRequest = { origin, destination, parcels: oneParcel, reference: '1001', serviceCode: 'AUS_PARCEL_REGULAR', description: 'Order 1001' }
const creds = { accountNumber: '1234567890', apiKey: 'KEY-SECRET', apiPassword: 'PASS-SECRET' }
const labelValues = { accountNumber: '1234567890', apiKey: 'KEY-SECRET', apiPassword: 'PASS-SECRET' }

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

/** A fake network: answers each call in order from a queue, and records every request. */
function scripted(answers: { status: number; body: unknown }[]): { send: JsonSend; calls: Call[] } {
  const calls: Call[] = []
  const send: JsonSend = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const next = answers.shift()
    if (!next) throw new Error(`unexpected call ${url}`)
    return { status: next.status, ok: next.status >= 200 && next.status < 300, body: next.body }
  }
  return { send, calls }
}

const shipmentOk = { shipments: [{ shipment_id: 'SHP-1', items: [{ item_id: 'ITEM-1', tracking_number: 'AP123456789', product_id: 'AUS_PARCEL_REGULAR' }] }] }

describe('Australia Post label request builder', () => {
  it('builds one shipment with from, to and one item, rounding dimensions and fixing weight to two decimals', () => {
    const body = buildShipmentBody(request) as { shipments: { shipment_reference: string; from: Record<string, unknown>; to: Record<string, unknown>; items: Record<string, unknown>[] }[] }
    const s = body.shipments[0]
    expect(s.shipment_reference).toBe('1001')
    expect(s.from).toMatchObject({ name: 'Gracen Shop', business_name: 'Gracen', lines: ['1 George St'], suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU', phone: '0400 000 000' })
    expect(s.to).toMatchObject({ name: 'Al Buyer', lines: ['2 Hay St', 'Unit 4'], suburb: 'Perth', state: 'WA', postcode: '6000', country: 'AU', email: 'al@example.com' })
    expect(s.items).toEqual([{ item_reference: '1001', product_id: 'AUS_PARCEL_REGULAR', length: '20', width: '10', height: '6', weight: '1.23' }])
  })
  it('never sends more than one parcel in a single label purchase', () => {
    expect(() => buildShipmentBody({ ...request, parcels: [...oneParcel, ...oneParcel] })).toThrow(/one parcel at a time/)
    expect(() => buildShipmentBody({ ...request, parcels: [] })).toThrow(/one parcel at a time/)
  })
  it('maps the chosen service to a product id and refuses anything that is not a product code', () => {
    expect(productIdFor('AUS_PARCEL_EXPRESS')).toBe('AUS_PARCEL_EXPRESS')
    expect(() => productIdFor('x; drop')).toThrow(/cannot be bought/)
    expect(() => productIdFor('')).toThrow(/cannot be bought/)
  })
  it('uses the Express Post group for express products and Parcel Post otherwise', () => {
    expect(buildLabelBody('SHP-1', 'AUS_PARCEL_EXPRESS')).toMatchObject({ preferences: [{ groups: [{ group: 'Express Post', layout: 'A4-1pp' }] }], shipments: [{ shipment_id: 'SHP-1' }] })
    expect(buildLabelBody('SHP-1', 'AUS_PARCEL_REGULAR')).toMatchObject({ preferences: [{ groups: [{ group: 'Parcel Post' }] }] })
  })
})

describe('Australia Post response parsers', () => {
  it('reads the shipment id and tracking number, and refuses an answer without them', () => {
    expect(parseShipmentResponse(shipmentOk)).toEqual({ shipmentId: 'SHP-1', trackingNumber: 'AP123456789' })
    expect(parseShipmentResponse({ shipments: [{ shipment_id: 'SHP-1', items: [{ item_id: 'ITEM-9' }] }] })).toEqual({ shipmentId: 'SHP-1', trackingNumber: 'ITEM-9' })
    expect(() => parseShipmentResponse({ shipments: [{ items: [{ tracking_number: 'X' }] }] })).toThrow(/did not return a shipment ID/)
    expect(() => parseShipmentResponse({})).toThrow(/did not return a shipment ID/)
  })
  it('reads the label request id and the first label URL that is ready', () => {
    expect(parseLabelRequestId({ request_id: 'req-7' })).toBe('req-7')
    expect(() => parseLabelRequestId({})).toThrow(/request id/)
    expect(parseLabelUrl({ labels: [{ url: '' }, { url: 'https://digitalapi.auspost.com.au/shipping/v1/labels/x.pdf' }] })).toBe('https://digitalapi.auspost.com.au/shipping/v1/labels/x.pdf')
    expect(parseLabelUrl({ labels: [] })).toBeNull()
    expect(parseLabelUrl(null)).toBeNull()
  })
})

describe('createAusPostLabel over a scripted network', () => {
  it('runs shipments, labels, then polls the label, sending Basic auth and the account header', async () => {
    const { send, calls } = scripted([
      { status: 201, body: shipmentOk },
      { status: 201, body: { request_id: 'req-7' } },
      { status: 200, body: { labels: [] } },
      { status: 200, body: { labels: [{ url: 'https://digitalapi.auspost.com.au/shipping/v1/labels/req-7.pdf' }] } },
    ])
    const waits: number[] = []
    const label = await createAusPostLabel({ creds, request, send, wait: async (ms) => void waits.push(ms) })
    expect(calls.map((c) => `${c.method} ${c.url.replace(AUSPOST_SHIPPING_BASE, '')}`)).toEqual(['POST /shipments', 'POST /labels', 'GET /labels/req-7', 'GET /labels/req-7'])
    for (const c of calls) {
      expect(c.headers.Authorization).toBe(`Basic ${btoa('KEY-SECRET:PASS-SECRET')}`)
      expect(c.headers['account-number']).toBe('1234567890')
    }
    expect(calls[1].body).toEqual(buildLabelBody('SHP-1', 'AUS_PARCEL_REGULAR'))
    expect(waits).toEqual([1000])
    expect(label).toEqual({
      carrier: 'auspost',
      serviceCode: 'AUS_PARCEL_REGULAR',
      serviceName: 'Australia Post AUS_PARCEL_REGULAR',
      trackingNumber: 'AP123456789',
      labelUrl: 'https://digitalapi.auspost.com.au/shipping/v1/labels/req-7.pdf',
      trackingUrl: 'https://auspost.com.au/mypost/track/#/details/AP123456789',
      carrierRef: 'SHP-1',
    })
  })
  it('keeps the tracking number and points at the label request when the PDF is still not ready', async () => {
    const { send } = scripted([{ status: 201, body: shipmentOk }, { status: 201, body: { request_id: 'req-8' } }, { status: 200, body: {} }, { status: 200, body: {} }])
    const label = await createAusPostLabel({ creds, request, send, wait: async () => {}, polls: 2 })
    expect(label.trackingNumber).toBe('AP123456789')
    expect(label.labelUrl).toBe(`${AUSPOST_SHIPPING_BASE}/labels/req-8`)
  })
  it('stops with a plain message when the shipment is refused, and never prints the keys', async () => {
    const { send, calls } = scripted([{ status: 422, body: { errors: [{ message: 'Suburb not recognised.' }] } }])
    const err = await createAusPostLabel({ creds, request, send }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Australia Post refused the shipment: Suburb not recognised.')
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(err)).not.toContain('SECRET')
  })
  it('says the key was not accepted on 401 without calling further', async () => {
    const { send, calls } = scripted([{ status: 401, body: {} }])
    await expect(createAusPostLabel({ creds, request, send })).rejects.toThrow('Australia Post did not accept the ShipPing API key or password.')
    expect(calls).toHaveLength(1)
  })
})

describe('Australia Post account check', () => {
  it('accepts a valid account and explains each failure', async () => {
    expect(await checkAusPostAccount(creds, scripted([{ status: 200, body: {} }]).send)).toEqual({ ok: true, message: 'Connected to the Shipping and Mailing account.' })
    expect((await checkAusPostAccount(creds, scripted([{ status: 404, body: {} }]).send)).message).toMatch(/does not recognise that account number/)
    expect((await checkAusPostAccount(creds, scripted([{ status: 403, body: {} }]).send)).message).toMatch(/did not accept/)
    expect((await checkAusPostAccount(creds, scripted([{ status: 500, body: {} }]).send)).message).toBe('Australia Post answered 500 for the Shipping and Mailing account.')
  })
})

describe('AusPostAdapter over a fake fetch', () => {
  const real = http.fetch
  let seen: { url: string; init?: RequestInit }[] = []
  const answer = (...queue: { status: number; body: unknown }[]) => {
    http.fetch = async (url, init) => {
      seen.push({ url, init })
      const next = queue.shift()!
      return new Response(JSON.stringify(next.body), { status: next.status })
    }
  }
  beforeEach(() => {
    seen = []
  })
  afterEach(() => {
    http.fetch = real
  })

  it('testConnection with only label keys checks the account and says so', async () => {
    answer({ status: 200, body: {} })
    const res = await new AusPostAdapter().testConnection({ values: labelValues, testMode: false })
    expect(res).toEqual({ ok: true, message: 'Connected to the Shipping and Mailing account.' })
    expect(seen[0].url).toBe(`${AUSPOST_SHIPPING_BASE}/accounts/1234567890`)
    expect(seen[0].init?.method ?? 'GET').toBe('GET')
  })
  it('testConnection lists the missing label keys without calling the network', async () => {
    const res = await new AusPostAdapter().testConnection({ values: { accountNumber: '1234567890', apiKey: 'K' }, testMode: false })
    expect(res).toEqual({ ok: false, message: 'Labels need ShipPing API password. Fill them in and save first.' })
    expect(seen).toHaveLength(0)
  })
  it('testConnection runs both checks when PAC and label keys are saved, and fails if either fails', async () => {
    answer({ status: 200, body: { services: { service: [{ code: 'AUS_PARCEL_REGULAR', name: 'Parcel Post', price: '9.00' }] } } }, { status: 401, body: {} })
    const res = await new AusPostAdapter().testConnection({ values: { pacKey: 'PAC', ...labelValues }, testMode: false })
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/Connected\. Australia Post returned 1 service/)
    expect(res.message).toMatch(/did not accept the ShipPing API key or password/)
    expect(seen.map((s) => (s.init?.headers as Record<string, string>)['AUTH-KEY'] ?? (s.init?.headers as Record<string, string>)['account-number'])).toEqual(['PAC', '1234567890'])
  })
  it('createLabel refuses until every label key is filled, and refuses in test mode', async () => {
    const adapter = new AusPostAdapter()
    await expect(adapter.createLabel({ values: { accountNumber: '1' }, testMode: false }, request)).rejects.toThrow('Enter the ShipPing API key, ShipPing API password first.')
    await expect(adapter.createLabel({ values: labelValues, testMode: true }, request)).rejects.toThrow(/Test mode is on/)
    expect(seen).toHaveLength(0)
  })
  it('createLabel buys a label in live mode through the same network seam', async () => {
    answer({ status: 201, body: shipmentOk }, { status: 201, body: { request_id: 'req-9' } }, { status: 200, body: { labels: [{ url: 'https://digitalapi.auspost.com.au/shipping/v1/labels/req-9.pdf' }] } })
    const label = await new AusPostAdapter().createLabel({ values: labelValues, testMode: false }, request)
    expect(label.trackingNumber).toBe('AP123456789')
    expect(seen.map((s) => s.url.replace(AUSPOST_SHIPPING_BASE, ''))).toEqual(['/shipments', '/labels', '/labels/req-9'])
  })
})

describe('catalogue: labels switch on only when the keys are filled', () => {
  it('marks Australia Post as label-capable and needs all three label keys', () => {
    expect(carrierDef('auspost')?.live).toEqual({ rates: true, labels: true })
    expect(carrierLabelsReady('auspost', labelValues)).toBe(true)
    expect(carrierLabelsReady('auspost', { ...labelValues, apiPassword: '' })).toBe(false)
    expect(carrierLabelsReady('auspost', { pacKey: 'only-rates' })).toBe(false)
  })
  it('keeps carriers without built-in labels switched off', () => {
    expect(carrierLabelsReady('startrack', { accountNumber: '1', apiKey: 'k', apiPassword: 'p' })).toBe(false)
    expect(carrierLabelsReady('nope', {})).toBe(false)
  })
})
