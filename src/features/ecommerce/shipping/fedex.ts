import { fetchJson } from './http'
import { oauthToken } from './oauth'
import { asList, carrierRefusal, countryOf, dollarsToCents, firstMessage, nextBusinessDate, parcelNumbers, singleParcel, streetLines, testModeBlocked, titleCase } from './rest-helpers'
import type { Address, CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

const LIVE = 'https://apis.fedex.com'
const TEST = 'https://apis-sandbox.fedex.com'
const NAME = 'FedEx'

const host = (creds: CarrierCredentials): string => (creds.testMode ? TEST : LIVE)

type FedexCharge = { rateType?: string; totalNetCharge?: number | string }
type FedexRate = { serviceType?: string; serviceName?: string; ratedShipmentDetails?: FedexCharge[] }
type FedexRateBody = { output?: { rateReplyDetails?: FedexRate[] } }
type FedexPiece = { trackingNumber?: string; packageDocuments?: { encodedLabel?: string }[] }
type FedexTransaction = {
  masterTrackingNumber?: string
  pieceResponses?: FedexPiece[]
  completedShipmentDetail?: { shipmentRating?: { shipmentRateDetails?: FedexCharge[] } }
}
type FedexShipBody = { output?: { transactionShipments?: FedexTransaction[] } }

/** FedEx address as the Rate API nests it, and as the Ship API uses it bare. */
const fedexAddress = (a: Address) => ({
  streetLines: streetLines(a),
  city: a.city ?? '',
  stateOrProvinceCode: (a.state ?? '').toUpperCase(),
  postalCode: a.postcode ?? '',
  countryCode: countryOf(a),
})

const fedexContact = (a: Address) => ({
  personName: a.name || a.company || 'Customer',
  companyName: a.company || undefined,
  phoneNumber: a.phone || undefined,
  emailAddress: a.email || undefined,
})

const fedexPackages = (parcels: RateRequest['parcels']) =>
  parcels.map((p) => {
    const n = parcelNumbers(p)
    return { weight: { units: 'KG', value: n.weight }, dimensions: { length: n.length, width: n.width, height: n.height, units: 'CM' } }
  })

const requireAccount = (creds: CarrierCredentials): string => {
  const acct = creds.values.accountNumber?.trim() ?? ''
  if (!acct) throw new Error('FedEx needs your nine-digit FedEx account number to quote prices or buy labels. Add it in Shop settings > Shipping.')
  return acct
}

const signIn = (creds: CarrierCredentials): Promise<string> =>
  oauthToken({
    carrier: NAME,
    tokenUrl: `${host(creds)}/oauth/token`,
    clientId: creds.values.apiKey ?? '',
    clientSecret: creds.values.secretKey ?? '',
    credentialsInBody: true,
  })

const headers = async (creds: CarrierCredentials): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await signIn(creds)}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-locale': 'en_AU',
})

/** FedEx names already start with "FedEx" in most replies; add the prefix only when missing. */
const serviceNameFor = (name: string): string => {
  const nice = titleCase(name).replace(/^Fedex\b/, 'FedEx')
  return nice.startsWith('FedEx') ? nice : `${NAME} ${nice}`
}

/** The account rate (what the shop pays) when FedEx sends one, otherwise the first rate listed. */
function pickCharge(details: FedexCharge[] | undefined): number {
  const list = details ?? []
  const chosen = list.find((d) => (d.rateType ?? '').includes('ACCOUNT')) ?? list[0]
  return dollarsToCents(chosen?.totalNetCharge)
}

/**
 * FedEx Rate and Ship APIs (REST, OAuth2 client credentials with the API key and secret key in the form
 * body). Test mode calls the sandbox host, which needs sandbox keys, and refuses to buy a label.
 */
export class FedExAdapter implements CarrierAdapter {
  readonly id = 'fedex' as const

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    if (!creds.values.apiKey?.trim() || !creds.values.secretKey?.trim()) return { ok: false, message: 'Enter the FedEx API key and secret key first.' }
    try {
      await signIn(creds)
      const where = creds.testMode ? 'the FedEx sandbox' : 'FedEx'
      return { ok: true, message: `Connected to ${where}.${creds.values.accountNumber?.trim() ? '' : ' Add the FedEx account number before quoting prices.'}` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach FedEx.' }
    }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    const acct = requireAccount(creds)
    const body = {
      accountNumber: { value: acct },
      requestedShipment: {
        shipper: { address: fedexAddress(request.origin) },
        recipient: { address: fedexAddress(request.destination) },
        pickupType: 'USE_SCHEDULED_PICKUP',
        rateRequestType: ['ACCOUNT', 'LIST'],
        shipDateStamp: nextBusinessDate(),
        packagingType: 'YOUR_PACKAGING',
        requestedPackageLineItems: fedexPackages(request.parcels),
      },
    }
    const res = await fetchJson<FedexRateBody>(`${host(creds)}/rate/v1/rates/quotes`, { method: 'POST', headers: await headers(creds), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const out: RateQuote[] = []
    for (const r of res.body?.output?.rateReplyDetails ?? []) {
      const cents = pickCharge(r.ratedShipmentDetails)
      if (!r.serviceType || !Number.isFinite(cents)) continue
      out.push({ carrier: 'fedex', serviceCode: r.serviceType, serviceName: serviceNameFor(r.serviceName || r.serviceType), costCents: cents, etaDays: null })
    }
    return out
  }

  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    if (creds.testMode) throw testModeBlocked(NAME)
    const acct = requireAccount(creds)
    const parcel = singleParcel(request.parcels, NAME)
    const body = {
      labelResponseOptions: 'LABEL',
      accountNumber: { value: acct },
      requestedShipment: {
        shipDatestamp: nextBusinessDate(),
        serviceType: request.serviceCode,
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'USE_SCHEDULED_PICKUP',
        shipper: { contact: fedexContact(request.origin), address: fedexAddress(request.origin) },
        recipients: [{ contact: fedexContact(request.destination), address: fedexAddress(request.destination) }],
        shippingChargesPayment: { paymentType: 'SENDER', payor: { responsibleParty: { accountNumber: { value: acct } } } },
        labelSpecification: { imageType: 'PDF', labelStockType: 'PAPER_4X6' },
        requestedPackageLineItems: fedexPackages([parcel]),
      },
    }
    const res = await fetchJson<FedexShipBody>(`${host(creds)}/ship/v1/shipments`, { method: 'POST', headers: await headers(creds), body: JSON.stringify(body) }, 15000)
    if (!res.ok) throw new Error(carrierRefusal(NAME, res.status, firstMessage(res.body)))
    const ts = asList(res.body?.output?.transactionShipments)[0]
    const piece = ts?.pieceResponses?.[0]
    const tracking = piece?.trackingNumber ?? ts?.masterTrackingNumber
    if (!tracking) throw new Error('FedEx accepted the shipment but did not return a tracking number.')
    const label = piece?.packageDocuments?.[0]?.encodedLabel
    const cents = pickCharge(ts?.completedShipmentDetail?.shipmentRating?.shipmentRateDetails)
    return {
      carrier: 'fedex',
      serviceCode: request.serviceCode,
      serviceName: `${NAME} ${request.serviceCode}`,
      trackingNumber: tracking,
      labelUrl: label ? `data:application/pdf;base64,${label}` : '',
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`,
      carrierRef: ts?.masterTrackingNumber ?? tracking,
      ...(Number.isFinite(cents) ? { costCents: cents } : {}),
    }
  }
  // No endOfDayManifest: FedEx pickups are booked in the carrier account.
}
