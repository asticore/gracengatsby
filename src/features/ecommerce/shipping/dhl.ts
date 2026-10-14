import { basicAuth, fetchJson } from './http'
import { carrierRefusal, countryOf, dollarsToCents, firstMessage, nextBusinessDate, parcelNumbers, requestId, singleParcel, streetLines, testModeBlocked, titleCase } from './rest-helpers'
import type { Address, CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

const LIVE = 'https://express.api.dhl.com/mydhlapi'
const TEST = 'https://express.api.dhl.com/mydhlapi/test'
const NAME = 'DHL Express'

const base = (creds: CarrierCredentials): string => (creds.testMode ? TEST : LIVE)

type DhlPrice = { currencyType?: string; priceCurrency?: string; price?: number | string }
type DhlProduct = { productCode?: string; productName?: string; totalPrice?: DhlPrice[]; deliveryCapabilities?: { totalTransitDays?: number | string } }
type DhlRates = { products?: DhlProduct[] }
type DhlShipment = { shipmentTrackingNumber?: string; documents?: { imageFormat?: string; content?: string; typeCode?: string }[] }

/**
 * DHL Express, MyDHL REST API (rates and shipments). Authentication is HTTP Basic with the API key as
 * the user name and the API secret as the password. The MyDHL reference also asks for an account number
 * on every rate and shipment, which is the label key `accountNumber`. Test mode uses the /test base path
 * and refuses to buy a label.
 */
const headers = (creds: CarrierCredentials): Record<string, string> => ({
  Authorization: basicAuth(creds.values.apiKey ?? '', creds.values.apiSecret ?? ''),
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Message-Reference': requestId(),
  'Message-Reference-Date': new Date().toUTCString(),
})

const accountOf = (creds: CarrierCredentials): string => {
  const acct = creds.values.accountNumber?.trim() ?? ''
  if (!acct) throw new Error('DHL needs your DHL Express account number to quote prices or buy labels. Add it in Shop settings > Shipping.')
  return acct
}

/** DHL wants the planned pickup as local time with its offset. Noon on the next weekday, Australian Eastern time. */
const shipStamp = (): string => `${nextBusinessDate()}T12:00:00GMT+10:00`

const contact = (a: Address) => ({
  fullName: a.name || a.company || 'Customer',
  companyName: a.company || a.name || 'Customer',
  phone: a.phone || undefined,
  email: a.email || undefined,
})

const party = (a: Address) => ({
  postalCode: a.postcode ?? '',
  cityName: a.city ?? '',
  countryCode: countryOf(a),
  provinceCode: a.state || undefined,
  addressLine1: streetLines(a)[0] ?? '',
  addressLine2: streetLines(a)[1] || undefined,
  contactInformation: contact(a),
})

const packages = (parcels: RateRequest['parcels']) =>
  parcels.map((p) => {
    const n = parcelNumbers(p)
    return { weight: n.weight, dimensions: { length: n.length, width: n.width, height: n.height } }
  })

/** Prefers the billing-currency price DHL sends; falls back to the first price listed. */
function pickPrice(prices: DhlPrice[] | undefined): number {
  const list = prices ?? []
  const chosen = list.find((p) => p.currencyType === 'BILLC') ?? list[0]
  return dollarsToCents(chosen?.price)
}

export class DhlAdapter implements CarrierAdapter {
  readonly id = 'dhl' as const

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    if (!creds.values.apiKey?.trim() || !creds.values.apiSecret?.trim()) return { ok: false, message: 'Enter the DHL API key and API secret first.' }
    if (!creds.values.accountNumber?.trim()) return { ok: false, message: 'Enter the DHL Express account number first.' }
    const sample: RateRequest = {
      origin: { line1: '1 George St', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
      destination: { line1: '2 Collins St', city: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' },
      parcels: [{ weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 10 }],
    }
    try {
      const quotes = await this.getRates(creds, sample)
      const where = creds.testMode ? 'the DHL test environment' : 'DHL Express'
      return quotes.length > 0 ? { ok: true, message: `Connected to ${where}.` } : { ok: false, message: 'Connected, but DHL returned no services for the test parcel.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach DHL Express.' }
    }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    const body = {
      customerDetails: { shipperDetails: party(request.origin), receiverDetails: party(request.destination) },
      accounts: [{ typeCode: 'shipper', number: accountOf(creds) }],
      plannedShippingDateAndTime: shipStamp(),
      unitOfMeasurement: 'metric',
      isCustomsDeclarable: false,
      packages: packages(request.parcels),
    }
    const res = await fetchJson<DhlRates>(`${base(creds)}/rates`, { method: 'POST', headers: headers(creds), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const out: RateQuote[] = []
    for (const p of res.body?.products ?? []) {
      const cents = pickPrice(p.totalPrice)
      if (!p.productCode || !Number.isFinite(cents)) continue
      const days = Number(p.deliveryCapabilities?.totalTransitDays)
      out.push({
        carrier: 'dhl',
        serviceCode: p.productCode,
        serviceName: `DHL ${titleCase(p.productName || p.productCode)}`,
        costCents: cents,
        etaDays: Number.isFinite(days) && days > 0 ? days : null,
      })
    }
    return out
  }

  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    if (creds.testMode) throw testModeBlocked(NAME)
    const parcel = singleParcel(request.parcels, NAME)
    const n = parcelNumbers(parcel)
    const body = {
      plannedShippingDateAndTime: shipStamp(),
      pickup: { isRequested: false },
      productCode: request.serviceCode,
      accounts: [{ typeCode: 'shipper', number: accountOf(creds) }],
      customerDetails: { shipperDetails: party(request.origin), receiverDetails: party(request.destination) },
      content: {
        packages: [{ weight: n.weight, dimensions: { length: n.length, width: n.width, height: n.height }, customerReferences: [{ value: request.reference.slice(0, 35), typeCode: 'CU' }] }],
        isCustomsDeclarable: false,
        description: (request.description || `Order ${request.reference}`).slice(0, 100),
        unitOfMeasurement: 'metric',
      },
      outputImageProperties: { encodingFormat: 'pdf', printerDPI: 300, imageOptions: [{ typeCode: 'label', templateName: 'ECOM26_84_001', isRequested: true }] },
    }
    const res = await fetchJson<DhlShipment>(`${base(creds)}/shipments`, { method: 'POST', headers: headers(creds), body: JSON.stringify(body) }, 15000)
    if (!res.ok || !res.body) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const tracking = res.body.shipmentTrackingNumber
    if (!tracking) throw new Error('DHL accepted the shipment but did not return a tracking number.')
    const doc = (res.body.documents ?? []).find((d) => d.typeCode === 'label' && d.content) ?? (res.body.documents ?? []).find((d) => d.content)
    return {
      carrier: 'dhl',
      serviceCode: request.serviceCode,
      serviceName: `${NAME} ${request.serviceCode}`,
      trackingNumber: tracking,
      labelUrl: doc?.content ? `data:application/pdf;base64,${doc.content}` : '',
      trackingUrl: `https://www.dhl.com/au-en/home/tracking.html?tracking-id=${encodeURIComponent(tracking)}`,
      carrierRef: tracking,
    }
  }
  // No endOfDayManifest: DHL pickups are booked in the carrier account.
}
