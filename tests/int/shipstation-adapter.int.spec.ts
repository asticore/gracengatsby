// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import { carrierDef, carrierLabelsReady } from '@/features/ecommerce/shipping/catalogue'
import { http } from '@/features/ecommerce/shipping/http'
import { getAdapter } from '@/features/ecommerce/shipping/registry'
import { ShipStationAdapter } from '@/features/ecommerce/shipping/shipstation'
import {
  buildLabelBody,
  buildRatesBody,
  joinServiceCode,
  parseCarriers,
  parseLabel,
  parseRates,
  refusalMessage,
  SHIPSTATION_BASE,
  sydneyShipDate,
  splitServiceCode,
} from '@/features/ecommerce/shipping/shipstation-labels'
import type { LabelRequest } from '@/features/ecommerce/shipping/types'

const origin = { name: 'Gracen Shop', company: 'Gracen', line1: '1 George St', city: 'Sydney', state: 'nsw', postcode: '2000', country: 'AU', phone: '0400 000 000' }
const destination = { name: 'Al Buyer', line1: '2 Hay St', line2: 'Unit 4', city: 'Perth', state: 'WA', postcode: '6000', country: 'au', email: 'al@example.com' }
const parcels = [{ weightKg: 1.2345, lengthCm: 20.04, widthCm: 10, heightCm: 5.6 }]
const request: LabelRequest = { origin, destination, parcels, reference: '1001', serviceCode: 'auspost_au/aus_parcel' }
const creds = { values: { apiKey: 'KEY-SECRET', apiSecret: 'SECRET-VALUE' }, testMode: false }

type Seen = { url: string; method: string; auth: string | null; body: unknown }

/** Answers each request in order from a queue and records what was sent. */
function fakeFetch(...answers: { status: number; body: unknown }[]): { seen: Seen[] } {
  const seen: Seen[] = []
  http.fetch = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    seen.push({ url, method: init?.method ?? 'GET', auth: headers.Authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const next = answers.shift()
    if (!next) throw new Error(`unexpected call ${url}`)
    return new Response(JSON.stringify(next.body), { status: next.status })
  }
  return { seen }
}

const CARRIERS_OK = [
  { code: 'auspost_au', nickname: 'Australia Post', name: 'auspost' },
  { code: 'startrack', name: 'StarTrack' },
]

describe('ShipStation pure helpers', () => {
  it('joins and splits the carrier and service codes', () => {
    expect(joinServiceCode('stamps_com', 'usps_ground')).toBe('stamps_com/usps_ground')
    expect(splitServiceCode('auspost_au/AUS_PARCEL')).toEqual({ carrierCode: 'auspost_au', serviceCode: 'AUS_PARCEL' })
    expect(() => splitServiceCode('no-slash')).toThrow(/cannot be bought/)
    expect(() => splitServiceCode('/AUS')).toThrow(/cannot be bought/)
  })
  it('builds the rates body in grams and centimetres, using the largest box and the summed weight', () => {
    const body = buildRatesBody('auspost_au', origin, destination, [
      { weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10 },
      { weightKg: 0.5, lengthCm: 30, widthCm: 20, heightCm: 10 },
    ])
    expect(body).toEqual({
      carrierCode: 'auspost_au',
      fromPostalCode: '2000',
      fromCity: 'Sydney',
      fromState: 'NSW',
      toCountry: 'AU',
      toPostalCode: '6000',
      toCity: 'Perth',
      toState: 'WA',
      weight: { value: 1500, units: 'grams' },
      dimensions: { length: 30, width: 20, height: 10, units: 'centimeters' },
    })
  })
  it('reads rates and drops rows without a code or a price', () => {
    expect(
      parseRates([
        { serviceName: 'Parcel Post', serviceCode: 'aus_parcel', shipmentCost: 12.345, otherCost: 0 },
        { serviceName: 'No code', shipmentCost: 5 },
        { serviceCode: 'bad', shipmentCost: 'abc' },
        { serviceCode: 'neg', shipmentCost: -1 },
      ]),
    ).toEqual([{ serviceCode: 'aus_parcel', serviceName: 'Parcel Post', costCents: 1235 }])
    expect(parseRates({ not: 'an array' })).toEqual([])
  })
  it('reads the connected carriers and prefers the nickname', () => {
    expect(parseCarriers(CARRIERS_OK)).toEqual([
      { code: 'auspost_au', name: 'Australia Post' },
      { code: 'startrack', name: 'StarTrack' },
    ])
    expect(parseCarriers([{ name: 'no code' }])).toEqual([])
  })
  it('builds the label body with testLabel false and the Sydney ship date', () => {
    const body = buildLabelBody(request, 'auspost_au', 'aus_parcel', '2026-10-14')
    expect(body).toMatchObject({
      carrierCode: 'auspost_au',
      serviceCode: 'aus_parcel',
      packageCode: 'package',
      confirmation: 'none',
      shipDate: '2026-10-14',
      weight: { value: 1235, units: 'grams' },
      testLabel: false,
    })
    expect(body.shipTo).toMatchObject({ name: 'Al Buyer', street1: '2 Hay St', street2: 'Unit 4', state: 'WA', postalCode: '6000', country: 'AU' })
    expect(body.shipFrom).toMatchObject({ company: 'Gracen', street1: '1 George St', state: 'NSW' })
  })
  it('gives the Sydney calendar date, even when UTC is still the day before', () => {
    // 2026-10-14 at 20:00 UTC is 2026-10-15 07:00 in Sydney (AEDT, UTC+11).
    expect(sydneyShipDate(new Date('2026-10-14T20:00:00Z'))).toBe('2026-10-15')
  })
  it('reads a label and refuses one without a tracking number or PDF', () => {
    expect(parseLabel({ shipmentId: 9, trackingNumber: 'TRK1', labelData: 'UERG', shipmentCost: 8.5 })).toEqual({ shipmentId: '9', trackingNumber: 'TRK1', labelData: 'UERG', costCents: 850 })
    expect(() => parseLabel({ labelData: 'x' })).toThrow(/did not return a tracking number/)
    expect(() => parseLabel({ trackingNumber: 'TRK1' })).toThrow(/did not return the label PDF/)
  })
  it('turns refusals into plain English', () => {
    expect(refusalMessage(401, {}, 'refused the label').message).toBe('ShipStation did not accept the API key or API secret.')
    expect(refusalMessage(429, {}, 'refused the label').message).toMatch(/too many requests/)
    expect(refusalMessage(400, { Message: 'Invalid postal code' }, 'refused the label').message).toBe('ShipStation refused the label: Invalid postal code.')
    expect(refusalMessage(500, {}, 'refused the label').message).toBe('ShipStation refused the label (500).')
  })
})

describe('ShipStationAdapter over a fake fetch', () => {
  const real = http.fetch
  afterEach(() => {
    http.fetch = real
  })

  it('testConnection asks for the carriers with Basic auth and lists them', async () => {
    const { seen } = fakeFetch({ status: 200, body: CARRIERS_OK })
    const res = await new ShipStationAdapter().testConnection(creds)
    expect(res).toEqual({ ok: true, message: 'Connected to ShipStation. Carriers: Australia Post, StarTrack.' })
    expect(seen[0].url).toBe(`${SHIPSTATION_BASE}/carriers`)
    expect(seen[0].auth).toBe(`Basic ${btoa('KEY-SECRET:SECRET-VALUE')}`)
  })
  it('testConnection says when no carriers are connected, and when keys are missing it makes no call', async () => {
    const { seen } = fakeFetch({ status: 200, body: [] })
    const none = await new ShipStationAdapter().testConnection(creds)
    expect(none.ok).toBe(false)
    expect(none.message).toMatch(/no carriers are connected/)
    const missing = await new ShipStationAdapter().testConnection({ values: { apiKey: 'k' }, testMode: false })
    expect(missing).toEqual({ ok: false, message: 'Enter the ShipStation API key and API secret first.' })
    expect(seen).toHaveLength(1)
  })
  it('testConnection reports a rejected key in plain English', async () => {
    fakeFetch({ status: 401, body: {} })
    const res = await new ShipStationAdapter().testConnection(creds)
    expect(res).toEqual({ ok: false, message: 'ShipStation did not accept the API key or API secret.' })
  })
  it('getRates prices each connected carrier and tags each service with its carrier code', async () => {
    const { seen } = fakeFetch(
      { status: 200, body: CARRIERS_OK },
      { status: 200, body: [{ serviceName: 'Parcel Post', serviceCode: 'aus_parcel', shipmentCost: 9.5 }] },
      { status: 500, body: {} },
    )
    const quotes = await new ShipStationAdapter().getRates(creds, { origin, destination, parcels })
    expect(quotes).toEqual([{ carrier: 'shipstation', serviceCode: 'auspost_au/aus_parcel', serviceName: 'Australia Post Parcel Post', costCents: 950, etaDays: null }])
    expect(seen.map((s) => s.url.replace(SHIPSTATION_BASE, ''))).toEqual(['/carriers', '/shipments/getrates', '/shipments/getrates'])
    expect(seen[1].body).toMatchObject({ carrierCode: 'auspost_au', toPostalCode: '6000' })
  })
  it('getRates throws when no carrier can price the parcel', async () => {
    fakeFetch({ status: 200, body: CARRIERS_OK }, { status: 500, body: {} }, { status: 500, body: {} })
    await expect(new ShipStationAdapter().getRates(creds, { origin, destination, parcels })).rejects.toThrow('ShipStation could not price this parcel with its carriers.')
  })
  it('createLabel refuses test mode and missing keys without any network call', async () => {
    const { seen } = fakeFetch()
    await expect(new ShipStationAdapter().createLabel({ ...creds, testMode: true }, request)).rejects.toThrow(/Test mode is on for ShipStation/)
    await expect(new ShipStationAdapter().createLabel({ values: {}, testMode: false }, request)).rejects.toThrow(/Enter the ShipStation API key/)
    expect(seen).toHaveLength(0)
  })
  it('createLabel buys a label in live mode and returns the PDF as a data link', async () => {
    const { seen } = fakeFetch({ status: 200, body: { shipmentId: 77, trackingNumber: 'TRK77', labelData: 'UERGLQ==', shipmentCost: 8 } })
    const label = await new ShipStationAdapter().createLabel(creds, request)
    expect(seen[0].url).toBe(`${SHIPSTATION_BASE}/shipments/createlabel`)
    expect(seen[0].body).toMatchObject({ carrierCode: 'auspost_au', serviceCode: 'aus_parcel', testLabel: false })
    expect(label).toEqual({
      carrier: 'shipstation',
      serviceCode: 'auspost_au/aus_parcel',
      serviceName: 'ShipStation auspost_au/aus_parcel',
      trackingNumber: 'TRK77',
      labelUrl: 'data:application/pdf;base64,UERGLQ==',
      carrierRef: '77',
      costCents: 800,
    })
  })
  it('createLabel refuses more than one parcel from here', async () => {
    fakeFetch()
    await expect(new ShipStationAdapter().createLabel(creds, { ...request, parcels: [...parcels, ...parcels] })).rejects.toThrow(/one parcel at a time/)
  })
})

describe('ShipStation is wired into the catalogue and registry', () => {
  it('switches rates and labels on, and needs both keys before labels are ready', () => {
    expect(carrierDef('shipstation')?.live).toEqual({ rates: true, labels: true })
    expect(carrierLabelsReady('shipstation', { apiKey: 'k', apiSecret: 's' })).toBe(true)
    expect(carrierLabelsReady('shipstation', { apiKey: 'k' })).toBe(false)
  })
  it('getAdapter returns the ShipStation adapter', () => {
    expect(getAdapter('shipstation')).toBeInstanceOf(ShipStationAdapter)
  })
})
