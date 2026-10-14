import { fetchJson } from './http'
import { oauthToken } from './oauth'
import { asList, carrierRefusal, countryOf, dollarsToCents, firstMessage, nextBusinessDate, parcelNumbers, requestId, singleParcel, streetLines, testModeBlocked } from './rest-helpers'
import type { Address, CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

const LIVE = 'https://onlinetools.ups.com'
const TEST = 'https://wwwcie.ups.com'
const NAME = 'UPS'
const VERSION = '2409'

const host = (creds: CarrierCredentials): string => (creds.testMode ? TEST : LIVE)

/** UPS service codes, for plain-English names. Anything else shows its code. */
const SERVICE_NAMES: Record<string, string> = {
  '01': 'Next Day Air',
  '02': '2nd Day Air',
  '03': 'Ground',
  '07': 'Worldwide Express',
  '08': 'Worldwide Expedited',
  '11': 'Standard',
  '12': '3 Day Select',
  '13': 'Next Day Air Saver',
  '14': 'Next Day Air Early',
  '54': 'Worldwide Express Plus',
  '59': '2nd Day Air A.M.',
  '65': 'Saver',
}

type UpsCharge = { CurrencyCode?: string; MonetaryValue?: number | string }
type UpsRated = { Service?: { Code?: string }; TotalCharges?: UpsCharge; GuaranteedDelivery?: { BusinessDaysInTransit?: number | string } }
type UpsRateBody = { RateResponse?: { RatedShipment?: UpsRated | UpsRated[] } }
type UpsPackageResult = { TrackingNumber?: string; ShippingLabel?: { ImageFormat?: { Code?: string }; GraphicImage?: string } }
type UpsShipBody = {
  ShipmentResponse?: {
    ShipmentResults?: {
      ShipmentIdentificationNumber?: string
      ShipmentCharges?: { TotalCharges?: UpsCharge }
      PackageResults?: UpsPackageResult | UpsPackageResult[]
    }
  }
}

/** UPS address block as the Rating and Shipping APIs name it. */
const upsAddress = (a: Address) => ({
  Address: { AddressLine: streetLines(a), City: a.city ?? '', StateProvinceCode: (a.state ?? '').toUpperCase(), PostalCode: a.postcode ?? '', CountryCode: countryOf(a) },
})

const upsParty = (a: Address) => ({
  Name: a.name || a.company || 'Customer',
  AttentionName: a.name || a.company || 'Customer',
  ...(a.phone ? { Phone: { Number: a.phone } } : {}),
  ...upsAddress(a),
})

const upsPackages = (parcels: RateRequest['parcels']) =>
  parcels.map((p) => {
    const n = parcelNumbers(p)
    return {
      PackagingType: { Code: '02' },
      Dimensions: { UnitOfMeasurement: { Code: 'CM' }, Length: String(n.length), Width: String(n.width), Height: String(n.height) },
      PackageWeight: { UnitOfMeasurement: { Code: 'KGS' }, Weight: n.weight.toFixed(2) },
    }
  })

const requireAccount = (creds: CarrierCredentials): string => {
  const acct = creds.values.accountNumber?.trim() ?? ''
  if (!acct) throw new Error('UPS needs your six-character UPS account number to quote prices or buy labels. Add it in Shop settings > Shipping.')
  return acct
}

const headers = async (creds: CarrierCredentials): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await signIn(creds)}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  transId: requestId(),
  transactionSrc: 'gracen-shop',
})

const signIn = (creds: CarrierCredentials): Promise<string> =>
  oauthToken({ carrier: NAME, tokenUrl: `${host(creds)}/security/v1/oauth/token`, clientId: creds.values.clientId ?? '', clientSecret: creds.values.clientSecret ?? '' })

/**
 * UPS Rating and Shipping APIs (REST, OAuth2 client credentials). Test mode calls the customer
 * integration environment (wwwcie.ups.com), which needs its own client ID and secret. Test mode also
 * refuses to buy a label.
 */
export class UpsAdapter implements CarrierAdapter {
  readonly id = 'ups' as const

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    if (!creds.values.clientId?.trim() || !creds.values.clientSecret?.trim()) return { ok: false, message: 'Enter the UPS client ID and client secret first.' }
    try {
      await signIn(creds)
      const where = creds.testMode ? 'the UPS test environment' : 'UPS'
      return { ok: true, message: `Connected to ${where}.${creds.values.accountNumber?.trim() ? '' : ' Add the UPS account number before quoting prices.'}` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach UPS.' }
    }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    const acct = requireAccount(creds)
    const body = {
      RateRequest: {
        Request: { SubVersion: VERSION, TransactionReference: { CustomerContext: 'checkout' } },
        Shipment: {
          Shipper: { Name: request.origin.name || request.origin.company || 'Shop', ShipperNumber: acct, ...upsAddress(request.origin) },
          ShipTo: upsParty(request.destination),
          ShipFrom: upsParty(request.origin),
          Package: upsPackages(request.parcels),
        },
      },
    }
    const res = await fetchJson<UpsRateBody>(`${host(creds)}/api/rating/v${VERSION}/Shop`, { method: 'POST', headers: await headers(creds), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const out: RateQuote[] = []
    for (const r of asList(res.body?.RateResponse?.RatedShipment)) {
      const code = r.Service?.Code
      const cents = dollarsToCents(r.TotalCharges?.MonetaryValue)
      if (!code || !Number.isFinite(cents)) continue
      const days = Number(r.GuaranteedDelivery?.BusinessDaysInTransit)
      out.push({
        carrier: 'ups',
        serviceCode: code,
        serviceName: `${NAME} ${SERVICE_NAMES[code] ?? `service ${code}`}`,
        costCents: cents,
        etaDays: Number.isFinite(days) && days > 0 ? days : null,
      })
    }
    return out
  }

  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    if (creds.testMode) throw testModeBlocked(NAME)
    const acct = requireAccount(creds)
    const parcel = singleParcel(request.parcels, NAME)
    const body = {
      ShipmentRequest: {
        Request: { SubVersion: VERSION, RequestOption: 'nonvalidate', TransactionReference: { CustomerContext: request.reference.slice(0, 512) } },
        Shipment: {
          Description: (request.description || `Order ${request.reference}`).slice(0, 50),
          Shipper: { ...upsParty(request.origin), ShipperNumber: acct },
          ShipTo: upsParty(request.destination),
          ShipFrom: upsParty(request.origin),
          PaymentInformation: { ShipmentCharge: { Type: '01', BillShipper: { AccountNumber: acct } } },
          Service: { Code: request.serviceCode },
          Package: upsPackages([parcel]),
        },
        LabelSpecification: { LabelImageFormat: { Code: 'GIF' } },
      },
    }
    const res = await fetchJson<UpsShipBody>(`${host(creds)}/api/shipments/v${VERSION}/ship`, { method: 'POST', headers: await headers(creds), body: JSON.stringify(body) }, 15000)
    if (!res.ok) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const results = res.body?.ShipmentResponse?.ShipmentResults
    const pkg = asList(results?.PackageResults)[0]
    const tracking = pkg?.TrackingNumber ?? results?.ShipmentIdentificationNumber
    if (!tracking) throw new Error('UPS accepted the shipment but did not return a tracking number.')
    const image = pkg?.ShippingLabel?.GraphicImage
    const format = (pkg?.ShippingLabel?.ImageFormat?.Code || 'GIF').toLowerCase()
    const cents = dollarsToCents(results?.ShipmentCharges?.TotalCharges?.MonetaryValue)
    return {
      carrier: 'ups',
      serviceCode: request.serviceCode,
      serviceName: `${NAME} ${SERVICE_NAMES[request.serviceCode] ?? `service ${request.serviceCode}`}`,
      trackingNumber: tracking,
      labelUrl: image ? `data:image/${format};base64,${image}` : '',
      trackingUrl: `https://www.ups.com/track?loc=en_AU&tracknum=${encodeURIComponent(tracking)}`,
      carrierRef: results?.ShipmentIdentificationNumber ?? tracking,
      ...(Number.isFinite(cents) ? { costCents: cents } : {}),
    }
  }
  // No endOfDayManifest: UPS pickups are booked in the carrier account.
}
