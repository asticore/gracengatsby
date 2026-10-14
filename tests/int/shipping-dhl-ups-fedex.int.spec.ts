// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearOauthCache } from '@/features/ecommerce/shipping/oauth'
import { DhlAdapter } from '@/features/ecommerce/shipping/dhl'
import { FedExAdapter } from '@/features/ecommerce/shipping/fedex'
import { http } from '@/features/ecommerce/shipping/http'
import { getAdapter } from '@/features/ecommerce/shipping/registry'
import { UpsAdapter } from '@/features/ecommerce/shipping/ups'
import type { Address, CarrierCredentials, LabelRequest, RateRequest } from '@/features/ecommerce/shipping/types'

const origin: Address = { name: 'Gracen Shop', company: 'Gracen', line1: '1 George St', city: 'Sydney', state: 'nsw', postcode: '2000', country: 'AU', phone: '0400 000 000', email: 'shop@example.com' }
const destination: Address = { name: 'Al Buyer', line1: '2 Hay St', line2: 'Unit 4', city: 'Perth', state: 'WA', postcode: '6000', country: 'au', email: 'al@example.com' }
const parcel = { weightKg: 1.234, lengthCm: 20.4, widthCm: 10, heightCm: 5.6 }
const rateReq: RateRequest = { origin, destination, parcels: [parcel] }
const labelReq: LabelRequest = { ...rateReq, reference: '1001', serviceCode: 'P', description: 'Order 1001' }

const upsCreds = (testMode: boolean): CarrierCredentials => ({ testMode, values: { clientId: 'UPS-ID', clientSecret: 'UPS-SECRET', accountNumber: 'A1B2C3' } })
const fedexCreds = (testMode: boolean): CarrierCredentials => ({ testMode, values: { apiKey: 'FX-KEY', secretKey: 'FX-SECRET', accountNumber: '123456789' } })
const dhlCreds = (testMode: boolean): CarrierCredentials => ({ testMode, values: { apiKey: 'DHL-KEY', apiSecret: 'DHL-SECRET', accountNumber: '987654321' } })

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null }
type Answer = { status: number; body: unknown }

/** Routes each request by URL and records it. Unknown URLs fail the test loudly. */
function routed(routes: Record<string, Answer | Answer[]>): { calls: Call[] } {
  const calls: Call[] = []
  const queues = new Map<string, Answer[]>()
  for (const [k, v] of Object.entries(routes)) queues.set(k, Array.isArray(v) ? [...v] : [v])
  http.fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: typeof init?.body === 'string' ? init.body : null })
    const key = Object.keys(routes).find((k) => url.startsWith(k))
    if (!key) throw new Error(`unexpected call ${url}`)
    const q = queues.get(key) ?? []
    const next = q.length > 1 ? q.shift()! : q[0]
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } })
  }
  return { calls }
}

const originalFetch = http.fetch

beforeEach(() => clearOauthCache())
afterEach(() => {
  http.fetch = originalFetch
  clearOauthCache()
})

const upsToken = { status: 200, body: { access_token: 'UPS-TOKEN', expires_in: '14399' } }
const fedexToken = { status: 200, body: { access_token: 'FX-TOKEN', expires_in: 3600 } }

describe('UPS adapter', () => {
  it('signs in once and reuses the token for the rate request, using the test host and Bearer auth', async () => {
    const { calls } = routed({
      'https://wwwcie.ups.com/security/v1/oauth/token': upsToken,
      'https://wwwcie.ups.com/api/rating/v2409/Shop': { status: 200, body: { RateResponse: { RatedShipment: [{ Service: { Code: '11' }, TotalCharges: { CurrencyCode: 'AUD', MonetaryValue: '14.25' }, GuaranteedDelivery: { BusinessDaysInTransit: '3' } }, { Service: { Code: '07' }, TotalCharges: { MonetaryValue: '62.10' } }] } } },
    })
    const quotes = await new UpsAdapter().getRates(upsCreds(true), rateReq)
    expect(quotes).toEqual([
      { carrier: 'ups', serviceCode: '11', serviceName: 'UPS Standard', costCents: 1425, etaDays: 3 },
      { carrier: 'ups', serviceCode: '07', serviceName: 'UPS Worldwide Express', costCents: 6210, etaDays: null },
    ])
    expect(calls[0].url).toBe('https://wwwcie.ups.com/security/v1/oauth/token')
    expect(calls[0].headers.Authorization).toMatch(/^Basic /)
    const rate = calls[1]
    expect(rate.headers.Authorization).toBe('Bearer UPS-TOKEN')
    const body = JSON.parse(rate.body ?? '{}')
    expect(body.RateRequest.Shipment.Shipper.ShipperNumber).toBe('A1B2C3')
    expect(body.RateRequest.Shipment.Package[0].PackageWeight).toEqual({ UnitOfMeasurement: { Code: 'KGS' }, Weight: '1.23' })
    expect(body.RateRequest.Shipment.ShipTo.Address.CountryCode).toBe('AU')
  })

  it('asks for the live host when test mode is off', async () => {
    const { calls } = routed({
      'https://onlinetools.ups.com/security/v1/oauth/token': upsToken,
      'https://onlinetools.ups.com/api/rating/v2409/Shop': { status: 200, body: { RateResponse: { RatedShipment: [] } } },
    })
    expect(await new UpsAdapter().getRates(upsCreds(false), rateReq)).toEqual([])
    expect(calls.map((c) => c.url)).toEqual(['https://onlinetools.ups.com/security/v1/oauth/token', 'https://onlinetools.ups.com/api/rating/v2409/Shop'])
  })

  it('gives a plain-English message when UPS does not accept the keys', async () => {
    routed({ 'https://wwwcie.ups.com/security/v1/oauth/token': { status: 401, body: { error: 'invalid_client' } } })
    await expect(new UpsAdapter().getRates(upsCreds(true), rateReq)).rejects.toThrow(/did not accept that client ID and secret/)
  })

  it('refuses to buy a label in test mode without making any call', async () => {
    const { calls } = routed({})
    await expect(new UpsAdapter().createLabel(upsCreds(true), labelReq)).rejects.toThrow(/no real label was bought/)
    expect(calls).toHaveLength(0)
  })

  it('buys a label live and returns the tracking number, the label image and the charge', async () => {
    const { calls } = routed({
      'https://onlinetools.ups.com/security/v1/oauth/token': upsToken,
      'https://onlinetools.ups.com/api/shipments/v2409/ship': {
        status: 200,
        body: { ShipmentResponse: { ShipmentResults: { ShipmentIdentificationNumber: '1Z999', ShipmentCharges: { TotalCharges: { MonetaryValue: '14.25' } }, PackageResults: { TrackingNumber: '1Z999AA1', ShippingLabel: { ImageFormat: { Code: 'GIF' }, GraphicImage: 'R0lGODlh' } } } } },
      },
    })
    const label = await new UpsAdapter().createLabel(upsCreds(false), labelReq)
    expect(label).toMatchObject({ carrier: 'ups', serviceCode: 'P', trackingNumber: '1Z999AA1', carrierRef: '1Z999', costCents: 1425, labelUrl: 'data:image/gif;base64,R0lGODlh' })
    const body = JSON.parse(calls[1].body ?? '{}')
    expect(body.ShipmentRequest.Shipment.PaymentInformation.ShipmentCharge.BillShipper.AccountNumber).toBe('A1B2C3')
    expect(body.ShipmentRequest.Shipment.Service.Code).toBe('P')
  })

  it('reports the carrier error text when a shipment is refused', async () => {
    routed({
      'https://onlinetools.ups.com/security/v1/oauth/token': upsToken,
      'https://onlinetools.ups.com/api/shipments/v2409/ship': { status: 400, body: { response: { errors: [{ code: '111285', message: 'The postal code is invalid.' }] } } },
    })
    await expect(new UpsAdapter().createLabel(upsCreds(false), labelReq)).rejects.toThrow('UPS refused the request: The postal code is invalid.')
  })

  it('refuses a multi-parcel order for a label and asks for a larger box', async () => {
    routed({})
    await expect(new UpsAdapter().createLabel(upsCreds(false), { ...labelReq, parcels: [parcel, parcel] })).rejects.toThrow(/one parcel at a time/)
  })

  it('needs the account number before it quotes', async () => {
    const { calls } = routed({})
    await expect(new UpsAdapter().getRates({ testMode: true, values: { clientId: 'a', clientSecret: 'b' } }, rateReq)).rejects.toThrow(/account number/)
    expect(calls).toHaveLength(0)
  })
})

describe('FedEx adapter', () => {
  it('signs in with the keys in the form body and asks the sandbox for rates', async () => {
    const { calls } = routed({
      'https://apis-sandbox.fedex.com/oauth/token': fedexToken,
      'https://apis-sandbox.fedex.com/rate/v1/rates/quotes': {
        status: 200,
        body: {
          output: {
            rateReplyDetails: [
              { serviceType: 'INTERNATIONAL_PRIORITY', serviceName: 'FedEx International Priority', ratedShipmentDetails: [{ rateType: 'LIST_RATE', totalNetCharge: 99 }, { rateType: 'PAYOR_ACCOUNT_PACKAGE', totalNetCharge: '48.5' }] },
              { serviceType: 'FEDEX_GROUND', serviceName: 'FEDEX GROUND', ratedShipmentDetails: [{ rateType: 'LIST_RATE', totalNetCharge: 20 }] },
            ],
          },
        },
      },
    })
    const quotes = await new FedExAdapter().getRates(fedexCreds(true), rateReq)
    expect(quotes).toEqual([
      { carrier: 'fedex', serviceCode: 'INTERNATIONAL_PRIORITY', serviceName: 'FedEx International Priority', costCents: 4850, etaDays: null },
      { carrier: 'fedex', serviceCode: 'FEDEX_GROUND', serviceName: 'FedEx Ground', costCents: 2000, etaDays: null },
    ])
    expect(calls[0].body).toContain('grant_type=client_credentials')
    expect(calls[0].body).toContain('client_secret=FX-SECRET')
    expect(calls[1].headers.Authorization).toBe('Bearer FX-TOKEN')
    const body = JSON.parse(calls[1].body ?? '{}')
    expect(body.accountNumber).toEqual({ value: '123456789' })
    expect(body.requestedShipment.requestedPackageLineItems[0].weight).toEqual({ units: 'KG', value: 1.23 })
  })

  it('refuses to buy a label in test mode without making any call', async () => {
    const { calls } = routed({})
    await expect(new FedExAdapter().createLabel(fedexCreds(true), labelReq)).rejects.toThrow(/no real label was bought/)
    expect(calls).toHaveLength(0)
  })

  it('buys a label live and returns tracking, the PDF label and the charge', async () => {
    routed({
      'https://apis.fedex.com/oauth/token': fedexToken,
      'https://apis.fedex.com/ship/v1/shipments': {
        status: 200,
        body: { output: { transactionShipments: [{ masterTrackingNumber: '794600000001', pieceResponses: [{ trackingNumber: '794600000001', packageDocuments: [{ encodedLabel: 'JVBERi0=' }] }], completedShipmentDetail: { shipmentRating: { shipmentRateDetails: [{ rateType: 'PAYOR_ACCOUNT_PACKAGE', totalNetCharge: 48.5 }] } } }] } },
      },
    })
    const label = await new FedExAdapter().createLabel(fedexCreds(false), labelReq)
    expect(label).toMatchObject({ carrier: 'fedex', trackingNumber: '794600000001', costCents: 4850, labelUrl: 'data:application/pdf;base64,JVBERi0=' })
  })

  it('gives a plain-English message on a refused shipment', async () => {
    routed({
      'https://apis.fedex.com/oauth/token': fedexToken,
      'https://apis.fedex.com/ship/v1/shipments': { status: 422, body: { errors: [{ code: 'INVALID.POSTALCODE', message: 'Postal code is not valid for the state.' }] } },
    })
    await expect(new FedExAdapter().createLabel(fedexCreds(false), labelReq)).rejects.toThrow('FedEx refused the request: Postal code is not valid for the state.')
  })

  it('reports unusable keys before any call when they are missing', async () => {
    const { calls } = routed({})
    const res = await new FedExAdapter().testConnection({ testMode: true, values: { apiKey: '' } })
    expect(res.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('DHL Express adapter', () => {
  it('uses basic auth with the key and secret and asks the test host for rates in the billing currency', async () => {
    const { calls } = routed({
      'https://express.api.dhl.com/mydhlapi/test/rates': {
        status: 200,
        body: {
          products: [
            { productCode: 'P', productName: 'EXPRESS WORLDWIDE', totalPrice: [{ currencyType: 'BASE', priceCurrency: 'USD', price: 40 }, { currencyType: 'BILLC', priceCurrency: 'AUD', price: '61.80' }], deliveryCapabilities: { totalTransitDays: 2 } },
            { productCode: 'N', productName: 'DOMESTIC EXPRESS', totalPrice: [{ currencyType: 'BILLC', priceCurrency: 'AUD', price: 12.5 }] },
          ],
        },
      },
    })
    const quotes = await new DhlAdapter().getRates(dhlCreds(true), rateReq)
    expect(quotes).toEqual([
      { carrier: 'dhl', serviceCode: 'P', serviceName: 'DHL Express Worldwide', costCents: 6180, etaDays: 2 },
      { carrier: 'dhl', serviceCode: 'N', serviceName: 'DHL Domestic Express', costCents: 1250, etaDays: null },
    ])
    expect(calls[0].headers.Authorization).toBe(`Basic ${btoa('DHL-KEY:DHL-SECRET')}`)
    const body = JSON.parse(calls[0].body ?? '{}')
    expect(body.accounts).toEqual([{ typeCode: 'shipper', number: '987654321' }])
    expect(body.unitOfMeasurement).toBe('metric')
  })

  it('needs the account number before it quotes', async () => {
    const { calls } = routed({})
    await expect(new DhlAdapter().getRates({ testMode: true, values: { apiKey: 'a', apiSecret: 'b' } }, rateReq)).rejects.toThrow(/account number/)
    expect(calls).toHaveLength(0)
  })

  it('gives a plain-English message when DHL does not accept the keys', async () => {
    routed({ 'https://express.api.dhl.com/mydhlapi/test/rates': { status: 401, body: { title: 'Unauthorized' } } })
    await expect(new DhlAdapter().getRates(dhlCreds(true), rateReq)).rejects.toThrow(/did not accept those keys/)
  })

  it('refuses to buy a label in test mode without making any call', async () => {
    const { calls } = routed({})
    await expect(new DhlAdapter().createLabel(dhlCreds(true), labelReq)).rejects.toThrow(/no real label was bought/)
    expect(calls).toHaveLength(0)
  })

  it('buys a label live and returns tracking and a PDF label', async () => {
    const { calls } = routed({
      'https://express.api.dhl.com/mydhlapi/shipments': { status: 201, body: { shipmentTrackingNumber: '1234567890', documents: [{ typeCode: 'label', imageFormat: 'PDF', content: 'JVBERi0=' }] } },
    })
    const label = await new DhlAdapter().createLabel(dhlCreds(false), labelReq)
    expect(label).toMatchObject({ carrier: 'dhl', serviceCode: 'P', trackingNumber: '1234567890', labelUrl: 'data:application/pdf;base64,JVBERi0=', carrierRef: '1234567890' })
    expect(label.costCents).toBeUndefined()
    const body = JSON.parse(calls[0].body ?? '{}')
    expect(body.productCode).toBe('P')
    expect(body.content.packages[0].customerReferences[0].value).toBe('1001')
  })

  it('fails clearly when DHL accepts a shipment without a tracking number', async () => {
    routed({ 'https://express.api.dhl.com/mydhlapi/shipments': { status: 201, body: { documents: [] } } })
    await expect(new DhlAdapter().createLabel(dhlCreds(false), labelReq)).rejects.toThrow(/did not return a tracking number/)
  })
})

describe('registry wiring', () => {
  it('returns the real adapters for DHL, UPS and FedEx', () => {
    expect(getAdapter('dhl')).toBeInstanceOf(DhlAdapter)
    expect(getAdapter('ups')).toBeInstanceOf(UpsAdapter)
    expect(getAdapter('fedex')).toBeInstanceOf(FedExAdapter)
  })
})
