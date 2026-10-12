import { basicAuth, fetchJson } from './http'
import type { Address, CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

const base = (creds: CarrierCredentials): string => (creds.testMode ? 'https://sandbox.sendle.com' : 'https://api.sendle.com')

const authHeader = (creds: CarrierCredentials): string => basicAuth(creds.values.sendleId ?? '', creds.values.apiKey ?? '')

type SendleQuote = {
  plan_name?: string
  product?: { code?: string; name?: string }
  quote?: { gross?: { amount?: number | string } }
  eta?: { days_range?: number[] }
}

type SendleOrder = {
  order_id?: string
  sendle_reference?: string
  tracking_url?: string
  labels?: { url?: string; format?: string }[]
  price?: { gross?: { amount?: number | string } }
  error?: string
  error_description?: string
  messages?: Record<string, string[]>
}

const party = (a: Address) => ({
  contact: { name: a.name || a.company || 'Customer', ...(a.phone ? { phone: a.phone } : {}), ...(a.email ? { email: a.email } : {}), ...(a.company ? { company: a.company } : {}) },
  address: { address_line1: a.line1 ?? '', ...(a.line2 ? { address_line2: a.line2 } : {}), suburb: a.city ?? '', state_name: a.state ?? '', postcode: a.postcode ?? '', country: (a.country || 'AU').toUpperCase() },
})

/**
 * Sendle (Australian door-to-door parcels). Basic auth with the Sendle ID and API key; test mode
 * points at sandbox.sendle.com. Sendle prices and ships ONE parcel per order, so rates add the
 * parcels together and the label call uses the first parcel (the order screen buys one label per
 * parcel). Response parsing is defensive: Sendle versions its payloads and a missing field must
 * fail clearly rather than store garbage.
 */
export class SendleAdapter implements CarrierAdapter {
  readonly id = 'sendle' as const

  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    if (!creds.values.sendleId?.trim() || !creds.values.apiKey?.trim()) return { ok: false, message: 'Enter the Sendle ID and API key first.' }
    try {
      const res = await fetchJson(`${base(creds)}/api/ping`, { headers: { Authorization: authHeader(creds), Accept: 'application/json' } })
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Sendle did not accept that Sendle ID and API key.' }
      if (!res.ok) return { ok: false, message: `Sendle answered ${res.status}.` }
      return { ok: true, message: creds.testMode ? 'Connected to the Sendle sandbox.' : 'Connected to Sendle.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach Sendle.' }
    }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    const { origin, destination } = request
    if (!origin.postcode || !origin.city || !destination.postcode || !destination.city) throw new Error('Sendle needs a suburb and postcode on both addresses.')
    // Sendle prices a single parcel: add the weights and take the largest box.
    const weight = request.parcels.reduce((s, p) => s + p.weightKg, 0)
    const biggest = request.parcels.reduce((a, p) => (p.lengthCm * p.widthCm * p.heightCm > a.lengthCm * a.widthCm * a.heightCm ? p : a), request.parcels[0])
    const q = new URLSearchParams({
      pickup_suburb: origin.city,
      pickup_postcode: origin.postcode,
      pickup_country: (origin.country || 'AU').toUpperCase(),
      delivery_suburb: destination.city,
      delivery_postcode: destination.postcode,
      delivery_country: (destination.country || 'AU').toUpperCase(),
      weight_value: String(weight),
      weight_units: 'kg',
      length_value: String(biggest.lengthCm),
      width_value: String(biggest.widthCm),
      height_value: String(biggest.heightCm),
      dimension_units: 'cm',
    })
    const res = await fetchJson<SendleQuote[]>(`${base(creds)}/api/quote?${q.toString()}`, { headers: { Authorization: authHeader(creds), Accept: 'application/json' } })
    if (res.status === 401 || res.status === 403) throw new Error('Sendle did not accept the API key.')
    if (!res.ok || !Array.isArray(res.body)) throw new Error(`Sendle answered ${res.status}.`)
    const out: RateQuote[] = []
    for (const quote of res.body) {
      const cents = Math.round(Number(quote.quote?.gross?.amount) * 100)
      const code = quote.product?.code || quote.plan_name
      if (!code || !Number.isFinite(cents)) continue
      const range = quote.eta?.days_range
      out.push({ carrier: 'sendle', serviceCode: code, serviceName: quote.product?.name || `Sendle ${quote.plan_name ?? code}`, costCents: cents, etaDays: Array.isArray(range) && range.length > 0 ? Number(range[range.length - 1]) : null })
    }
    return out
  }

  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    const parcel = request.parcels[0]
    if (!parcel) throw new Error('There is nothing to ship.')
    const pickup = new Date(Date.now() + 86400_000)
    // Skip to Monday: couriers do not collect on weekends.
    while (pickup.getUTCDay() === 0 || pickup.getUTCDay() === 6) pickup.setUTCDate(pickup.getUTCDate() + 1)
    const body = {
      pickup_date: pickup.toISOString().slice(0, 10),
      first_mile_option: 'pickup',
      description: (request.description || `Order ${request.reference}`).slice(0, 150),
      weight: { value: String(parcel.weightKg), units: 'kg' },
      dimensions: { length: String(parcel.lengthCm), width: String(parcel.widthCm), height: String(parcel.heightCm), units: 'cm' },
      customer_reference: request.reference.slice(0, 50),
      product_code: request.serviceCode,
      sender: party(request.origin),
      receiver: party(request.destination),
    }
    const res = await fetchJson<SendleOrder>(`${base(creds)}/api/orders`, {
      method: 'POST',
      headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': `order-${request.reference}-${request.serviceCode}-${parcel.weightKg}` },
      body: JSON.stringify(body),
    }, 15000)
    if (res.status === 401 || res.status === 403) throw new Error('Sendle did not accept the API key.')
    if (!res.ok || !res.body) {
      const detail = res.body?.error_description || (res.body?.messages ? Object.values(res.body.messages).flat().join(' ') : '') || res.body?.error
      throw new Error(`Sendle refused the order${detail ? `: ${detail}` : ` (${res.status})`}.`)
    }
    const tracking = res.body.sendle_reference
    if (!tracking || !res.body.order_id) throw new Error('Sendle accepted the order but did not return a tracking reference.')
    const label = res.body.labels?.find((l) => l.format === 'pdf')?.url || res.body.labels?.[0]?.url || `${base(creds)}/api/orders/${res.body.order_id}/labels/a4.pdf`
    const cents = Math.round(Number(res.body.price?.gross?.amount) * 100)
    return {
      carrier: 'sendle',
      serviceCode: request.serviceCode,
      serviceName: `Sendle ${request.serviceCode}`,
      trackingNumber: tracking,
      labelUrl: label,
      trackingUrl: res.body.tracking_url || `https://track.sendle.com/tracking?ref=${encodeURIComponent(tracking)}`,
      carrierRef: res.body.order_id,
      ...(Number.isFinite(cents) ? { costCents: cents } : {}),
    }
  }
  // No endOfDayManifest: Sendle collects from the pickup booked with each order.
}
