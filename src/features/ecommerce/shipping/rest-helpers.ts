import type { Address, Parcel } from './types'

/** Plain-English line for a carrier answer that is not OK. Never echoes keys. */
export function carrierRefusal(carrier: string, status: number, detail?: string | null): string {
  if (status === 401 || status === 403) return `${carrier} did not accept those keys. Check them in Shop settings > Shipping.`
  if (status === 429) return `${carrier} is busy right now. Try again in a minute.`
  if (status >= 500) return `${carrier} had a problem (${status}). Try again shortly.`
  return detail ? `${carrier} refused the request: ${detail}` : `${carrier} refused the request (${status}).`
}

/** The first readable error sentence in a carrier error body (DHL title/detail, UPS and FedEx errors[]). */
export function firstMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const response = o.response && typeof o.response === 'object' ? (o.response as Record<string, unknown>) : {}
  const errors = Array.isArray(o.errors) ? o.errors : Array.isArray(response.errors) ? response.errors : []
  const first = errors[0] as Record<string, unknown> | undefined
  if (first && typeof first.message === 'string' && first.message.trim()) return first.message.trim()
  for (const key of ['detail', 'title', 'message']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Carrier money (number or numeric string, in dollars) to whole cents. NaN when it is not a usable amount. */
export function dollarsToCents(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN
}

export const asList = <T>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : [])

/** A fresh id for request headers (alphanumeric, 28 to 32 characters). */
export function requestId(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).padEnd(28, '0').slice(0, 32)
}

export const countryOf = (a: Address): string => (a.country || 'AU').trim().toUpperCase()

/** Street lines without blanks. */
export const streetLines = (a: Address): string[] => [a.line1, a.line2].map((s) => (s ?? '').trim()).filter(Boolean)

/** Carrier-friendly parcel numbers: centimetres rounded up, kilograms to two decimals (at least 0.01 kg). */
export function parcelNumbers(p: Parcel): { weight: number; length: number; width: number; height: number } {
  return {
    weight: Math.max(0.01, Math.round(p.weightKg * 100) / 100),
    length: Math.max(1, Math.ceil(p.lengthCm)),
    width: Math.max(1, Math.ceil(p.widthCm)),
    height: Math.max(1, Math.ceil(p.heightCm)),
  }
}

/** The next weekday as YYYY-MM-DD, because couriers do not collect at weekends. */
export function nextBusinessDate(now: number = Date.now()): string {
  const d = new Date(now + 86400_000)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Labels are bought one parcel at a time; a multi-parcel order is refused rather than half-labelled. */
export function singleParcel(parcels: Parcel[], carrier: string): Parcel {
  if (parcels.length !== 1) throw new Error(`This order packs into ${parcels.length} parcels, and ${carrier} labels cover one parcel at a time. Use a larger box size in Shop settings > Shipping, or buy the label in the carrier account.`)
  return parcels[0]
}

/** The refusal for a label request made while test mode is on. */
export const testModeBlocked = (carrier: string): Error =>
  new Error(`Test mode is on for ${carrier}, so no real label was bought. Switch test mode off in Shop settings > Shipping to buy labels.`)

/** Title-cases an all-caps service name such as EXPRESS WORLDWIDE. Mixed-case names are left alone. */
export const titleCase = (s: string): string => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s)
