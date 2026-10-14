import type { Address, LabelRequest, Parcel } from './types'

/**
 * ShipStation REST API (V1): request builders and response readers for rates and labels. Pure
 * functions, so the exact JSON can be checked in tests without any network.
 *
 * Endpoints (from the V1 docs): GET /carriers, POST /shipments/getrates, POST /shipments/createlabel.
 * Auth is HTTP Basic with the API key as the username and the API secret as the password.
 */

export const SHIPSTATION_BASE = 'https://ssapi.shipstation.com'

/** ShipStation rates are per connected carrier, so a live option id carries both codes as "carrierCode/serviceCode". */
export function joinServiceCode(carrierCode: string, serviceCode: string): string {
  return `${carrierCode}/${serviceCode}`
}

export function splitServiceCode(code: string): { carrierCode: string; serviceCode: string } {
  const i = code.indexOf('/')
  if (i <= 0 || i === code.length - 1) throw new Error('That ShipStation service cannot be bought from here. Choose another service.')
  return { carrierCode: code.slice(0, i), serviceCode: code.slice(i + 1) }
}

type Loose = Record<string, unknown>
const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const clean = (v: unknown, max: number): string => str(v).replace(/\s+/g, ' ').slice(0, max)

/** The parcel to price or ship: weights added together, dimensions taken from the largest box. */
export function summaryParcel(parcels: Parcel[]): { weightKg: number; lengthCm: number; widthCm: number; heightCm: number } {
  const weightKg = parcels.reduce((s, p) => s + p.weightKg, 0)
  const biggest = parcels.reduce((a, p) => (p.lengthCm * p.widthCm * p.heightCm > a.lengthCm * a.widthCm * a.heightCm ? p : a), parcels[0])
  return { weightKg, lengthCm: biggest.lengthCm, widthCm: biggest.widthCm, heightCm: biggest.heightCm }
}

const grams = (kg: number): number => Math.max(1, Math.round(kg * 1000))
const cm = (v: number): number => Math.max(1, Math.round(v * 10) / 10)

/** Body for POST /shipments/getrates, for one carrier account. Weights in grams, sizes in centimetres. */
export function buildRatesBody(carrierCode: string, origin: Address, destination: Address, parcels: Parcel[]): Loose {
  const p = summaryParcel(parcels)
  return {
    carrierCode,
    fromPostalCode: clean(origin.postcode, 10),
    fromCity: clean(origin.city, 60),
    fromState: clean(origin.state, 3).toUpperCase(),
    toCountry: (destination.country || 'AU').toUpperCase(),
    toPostalCode: clean(destination.postcode, 10),
    toCity: clean(destination.city, 60),
    toState: clean(destination.state, 3).toUpperCase(),
    weight: { value: grams(p.weightKg), units: 'grams' },
    dimensions: { length: cm(p.lengthCm), width: cm(p.widthCm), height: cm(p.heightCm), units: 'centimeters' },
  }
}

export type ParsedRate = { serviceCode: string; serviceName: string; costCents: number }

/** Reads the array from POST /shipments/getrates. Rows without a code or a sensible price are dropped. */
export function parseRates(body: unknown): ParsedRate[] {
  const out: ParsedRate[] = []
  for (const row of arr(body).map(obj)) {
    const serviceCode = str(row.serviceCode)
    const amount = Number(row.shipmentCost)
    const costCents = Math.round(amount * 100)
    if (!serviceCode || !Number.isFinite(costCents) || costCents < 0) continue
    out.push({ serviceCode, serviceName: str(row.serviceName) || serviceCode, costCents })
  }
  return out
}

export type ConnectedCarrier = { code: string; name: string }

/** Reads GET /carriers: the carriers the account has connected in ShipStation. */
export function parseCarriers(body: unknown): ConnectedCarrier[] {
  const out: ConnectedCarrier[] = []
  for (const row of arr(body).map(obj)) {
    const code = str(row.code)
    if (!code) continue
    out.push({ code, name: str(row.nickname) || str(row.name) || code })
  }
  return out
}

const addressBlock = (a: Address): Loose => ({
  name: clean(a.name || a.company, 60) || 'Customer',
  ...(clean(a.company, 60) ? { company: clean(a.company, 60) } : {}),
  street1: clean(a.line1, 60),
  ...(clean(a.line2, 60) ? { street2: clean(a.line2, 60) } : {}),
  city: clean(a.city, 60),
  state: clean(a.state, 3).toUpperCase(),
  postalCode: clean(a.postcode, 10),
  country: (a.country || 'AU').toUpperCase(),
  ...(clean(a.phone, 20) ? { phone: clean(a.phone, 20) } : {}),
})

/** Body for POST /shipments/createlabel. One parcel per call; testLabel is always false (test mode never gets here). */
export function buildLabelBody(request: LabelRequest, carrierCode: string, serviceCode: string, shipDate: string): Loose {
  const p = summaryParcel(request.parcels)
  return {
    carrierCode,
    serviceCode,
    packageCode: 'package',
    confirmation: 'none',
    shipDate,
    weight: { value: grams(p.weightKg), units: 'grams' },
    dimensions: { length: cm(p.lengthCm), width: cm(p.widthCm), height: cm(p.heightCm), units: 'centimeters' },
    shipFrom: addressBlock(request.origin),
    shipTo: addressBlock(request.destination),
    testLabel: false,
  }
}

/** The ship date as YYYY-MM-DD in Sydney time, so a label bought at 8am is dated today, not yesterday. */
export function sydneyShipDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const pick = (t: string): string => parts.find((x) => x.type === t)?.value ?? '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

export type ParsedLabel = { shipmentId: string; trackingNumber: string; costCents?: number; labelData: string }

/** Reads POST /shipments/createlabel. Throws if the tracking number or the PDF is missing, so nothing half-saved is recorded. */
export function parseLabel(body: unknown): ParsedLabel {
  const r = obj(body)
  const trackingNumber = str(r.trackingNumber)
  const labelData = str(r.labelData)
  if (!trackingNumber) throw new Error('ShipStation bought the label but did not return a tracking number. Check the label in ShipStation before shipping.')
  if (!labelData) throw new Error('ShipStation bought the label but did not return the label PDF. Print it from ShipStation.')
  const cents = Math.round(Number(r.shipmentCost) * 100)
  return { shipmentId: str(r.shipmentId), trackingNumber, labelData, ...(Number.isFinite(cents) && cents >= 0 ? { costCents: cents } : {}) }
}

/** Turns a refusal into a plain-English message, using ShipStation's own text when it gives one. */
export function refusalMessage(status: number, body: unknown, what: string): Error {
  if (status === 401 || status === 403) return new Error('ShipStation did not accept the API key or API secret.')
  if (status === 429) return new Error('ShipStation is busy right now (too many requests). Wait a minute and try again.')
  const detail = str(obj(body).Message) || str(obj(body).message)
  const tail = detail ? `: ${detail}` : ` (${status})`
  return new Error(`ShipStation ${what}${tail}${/[.!?]$/.test(tail) ? '' : '.'}`)
}
