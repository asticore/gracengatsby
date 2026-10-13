import { basicAuth, fetchJson } from './http'
import type { Address, ConnectionResult, LabelRequest, LabelResult } from './types'

/**
 * Australia Post Shipping and Mailing API (v1): buys parcel labels. Flow, per the v1 docs:
 *   1. POST /shipments  - creates the shipment; returns shipment_id and the item's tracking number.
 *   2. POST /labels     - asks for the label PDF; returns a request_id (label creation is asynchronous).
 *   3. GET  /labels/{request_id} - returns the label URL once it is ready (polled a few times).
 * Every call uses HTTP Basic auth (ShipPing API key : API password) and the `account-number` header.
 *
 * This file is pure apart from the injectable `send`: builders and parsers take plain objects, and the
 * network functions take a `send` so tests can answer with canned JSON.
 */

export const AUSPOST_SHIPPING_BASE = 'https://digitalapi.auspost.com.au/shipping/v1'

export type AusPostLabelCreds = { accountNumber: string; apiKey: string; apiPassword: string }

/** Plain-English names for the three label keys, used in messages. */
export const LABEL_KEY_NAMES: Record<keyof AusPostLabelCreds, string> = {
  accountNumber: 'account number',
  apiKey: 'ShipPing API key',
  apiPassword: 'ShipPing API password',
}

export type JsonSend = (url: string, init?: RequestInit, timeoutMs?: number) => Promise<{ status: number; ok: boolean; body: unknown }>

type Loose = Record<string, unknown>
const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const clean = (v: unknown, max: number): string => str(v).replace(/\s+/g, ' ').slice(0, max)

const PRODUCT_CODE = /^[A-Z][A-Z0-9_]{2,63}$/

/** The label keys that are still empty. An empty list means labels can be bought. */
export function missingLabelKeys(values: Record<string, string | undefined>): (keyof AusPostLabelCreds)[] {
  return (Object.keys(LABEL_KEY_NAMES) as (keyof AusPostLabelCreds)[]).filter((k) => !(values[k] ?? '').trim())
}

/** True when at least one label key has a value, so the account should be checked. */
export const hasAnyLabelKey = (values: Record<string, string | undefined>): boolean => (Object.keys(LABEL_KEY_NAMES) as (keyof AusPostLabelCreds)[]).some((k) => (values[k] ?? '').trim() !== '')

export function labelCredsFrom(values: Record<string, string | undefined>): AusPostLabelCreds {
  return { accountNumber: (values.accountNumber ?? '').trim(), apiKey: (values.apiKey ?? '').trim(), apiPassword: (values.apiPassword ?? '').trim() }
}

/** The service code from the PAC rates is the product id (for example AUS_PARCEL_REGULAR). Anything else is refused. */
export function productIdFor(serviceCode: string): string {
  const code = serviceCode.trim()
  if (!PRODUCT_CODE.test(code)) throw new Error('That Australia Post service cannot be bought from here. Choose another service.')
  return code
}

export function addressBlock(a: Address): Loose {
  const lines = [clean(a.line1, 40), clean(a.line2, 40)].filter(Boolean)
  return {
    name: clean(a.name || a.company, 40) || 'Customer',
    ...(clean(a.company, 40) ? { business_name: clean(a.company, 40) } : {}),
    lines,
    suburb: clean(a.city, 40),
    state: clean(a.state, 3).toUpperCase(),
    postcode: clean(a.postcode, 4),
    country: (a.country || 'AU').toUpperCase(),
    ...(clean(a.phone, 20) ? { phone: clean(a.phone, 20) } : {}),
    ...(clean(a.email, 80) ? { email: clean(a.email, 80) } : {}),
  }
}

/**
 * Builds POST /shipments. One parcel per call: the order screen buys one label at a time, and a
 * second parcel would need its own tracking number, which the label record cannot hold yet.
 */
export function buildShipmentBody(request: LabelRequest): Loose {
  if (request.parcels.length !== 1) {
    throw new Error('Australia Post labels are bought one parcel at a time from here. Buy the other parcels in your Australia Post account.')
  }
  const parcel = request.parcels[0]
  const reference = clean(request.reference, 50) || 'order'
  const dim = (cm: number): string => String(Math.max(1, Math.round(cm)))
  return {
    shipments: [
      {
        shipment_reference: reference,
        from: addressBlock(request.origin),
        to: addressBlock(request.destination),
        items: [
          {
            item_reference: reference,
            product_id: productIdFor(request.serviceCode),
            length: dim(parcel.lengthCm),
            width: dim(parcel.widthCm),
            height: dim(parcel.heightCm),
            weight: Math.max(0.01, parcel.weightKg).toFixed(2),
          },
        ],
      },
    ],
  }
}

/** Builds POST /labels for one shipment. The group follows the product: Express Post or Parcel Post. */
export function buildLabelBody(shipmentId: string, productId: string): Loose {
  const group = /EXPRESS/i.test(productId) ? 'Express Post' : 'Parcel Post'
  return {
    wait_for_label_url: false,
    preferences: [{ type: 'PRINT', groups: [{ group, layout: 'A4-1pp', branded: true, left_offset: 0, top_offset: 0 }] }],
    shipments: [{ shipment_id: shipmentId }],
  }
}

export type ParsedShipment = { shipmentId: string; trackingNumber: string }

/** Reads the first shipment and its first item. Throws if the id or tracking number is missing. */
export function parseShipmentResponse(body: unknown): ParsedShipment {
  const shipment = obj(arr(obj(body).shipments)[0])
  const item = obj(arr(shipment.items)[0])
  const shipmentId = str(shipment.shipment_id)
  const trackingNumber = str(item.tracking_number) || str(item.item_id)
  if (!shipmentId || !trackingNumber) throw new Error('Australia Post accepted the shipment but did not return a shipment ID and tracking number.')
  return { shipmentId, trackingNumber }
}

/** Reads the request id that POST /labels returns. */
export function parseLabelRequestId(body: unknown): string {
  const id = str(obj(body).request_id)
  if (!id) throw new Error('Australia Post did not return a label request id.')
  return id
}

/** Reads the label URL from GET /labels/{request_id}, or null while the label is still being made. */
export function parseLabelUrl(body: unknown): string | null {
  const labels = arr(obj(body).labels).map(obj)
  return str(labels.find((l) => str(l.url))?.url) || str(obj(body).url) || null
}

export const auspostTrackingUrl = (tracking: string): string => `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(tracking)}`

/** Turns a refusal into a plain-English message, using the API's own error text when it gives one. */
export function refusalMessage(status: number, body: unknown, what: string): Error {
  if (status === 401 || status === 403) return new Error('Australia Post did not accept the ShipPing API key or password.')
  const detail = arr(obj(body).errors)
    .map((e) => str(obj(e).message))
    .filter(Boolean)
    .join(' ') || str(obj(body).message)
  const tail = detail ? `: ${detail}` : ` (${status})`
  return new Error(`Australia Post ${what}${tail}${/[.!?]$/.test(tail) ? '' : '.'}`)
}

const authHeaders = (creds: AusPostLabelCreds): Record<string, string> => ({
  Authorization: basicAuth(creds.apiKey, creds.apiPassword),
  'account-number': creds.accountNumber,
  Accept: 'application/json',
})

const jsonHeaders = (creds: AusPostLabelCreds): Record<string, string> => ({ ...authHeaders(creds), 'Content-Type': 'application/json' })

const defaultSend: JsonSend = (url, init, timeoutMs) => fetchJson(url, init, timeoutMs)

/** GET /accounts/{account} - the cheapest read that proves the account number and keys belong together. */
export async function checkAusPostAccount(creds: AusPostLabelCreds, send: JsonSend = defaultSend): Promise<ConnectionResult> {
  const res = await send(`${AUSPOST_SHIPPING_BASE}/accounts/${encodeURIComponent(creds.accountNumber)}`, { headers: authHeaders(creds) })
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'Australia Post did not accept the ShipPing API key or password.' }
  if (res.status === 404) return { ok: false, message: 'Australia Post does not recognise that account number.' }
  if (!res.ok) return { ok: false, message: `Australia Post answered ${res.status} for the Shipping and Mailing account.` }
  return { ok: true, message: 'Connected to the Shipping and Mailing account.' }
}

/**
 * Buys one parcel label: shipment, label request, then poll for the URL. If the URL is not ready after
 * the polls, the label still exists, so the result points at the label request and the tracking number is kept.
 */
export async function createAusPostLabel(args: { creds: AusPostLabelCreds; request: LabelRequest; send?: JsonSend; wait?: (ms: number) => Promise<void>; polls?: number }): Promise<LabelResult> {
  const { creds, request } = args
  const send = args.send ?? defaultSend
  const wait = args.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const polls = Math.max(1, args.polls ?? 4)
  const productId = productIdFor(request.serviceCode)

  const shipmentRes = await send(`${AUSPOST_SHIPPING_BASE}/shipments`, { method: 'POST', headers: jsonHeaders(creds), body: JSON.stringify(buildShipmentBody(request)) }, 15000)
  if (!shipmentRes.ok) throw refusalMessage(shipmentRes.status, shipmentRes.body, 'refused the shipment')
  const shipment = parseShipmentResponse(shipmentRes.body)

  const labelRes = await send(`${AUSPOST_SHIPPING_BASE}/labels`, { method: 'POST', headers: jsonHeaders(creds), body: JSON.stringify(buildLabelBody(shipment.shipmentId, productId)) }, 15000)
  if (!labelRes.ok) throw refusalMessage(labelRes.status, labelRes.body, 'could not make the label')
  const requestId = parseLabelRequestId(labelRes.body)

  let labelUrl: string | null = null
  for (let i = 0; i < polls && !labelUrl; i++) {
    if (i > 0) await wait(1000 * i)
    const res = await send(`${AUSPOST_SHIPPING_BASE}/labels/${encodeURIComponent(requestId)}`, { headers: authHeaders(creds) }, 15000)
    if (!res.ok) throw refusalMessage(res.status, res.body, 'could not give the label back')
    labelUrl = parseLabelUrl(res.body)
  }

  return {
    carrier: 'auspost',
    serviceCode: request.serviceCode,
    serviceName: `Australia Post ${request.serviceCode}`,
    trackingNumber: shipment.trackingNumber,
    labelUrl: labelUrl ?? `${AUSPOST_SHIPPING_BASE}/labels/${encodeURIComponent(requestId)}`,
    trackingUrl: auspostTrackingUrl(shipment.trackingNumber),
    carrierRef: shipment.shipmentId,
  }
}
