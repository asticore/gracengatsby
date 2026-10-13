import { fetchJson } from './http'
import { checkAusPostAccount, createAusPostLabel, hasAnyLabelKey, labelCredsFrom, LABEL_KEY_NAMES, missingLabelKeys } from './auspost-labels'
import type { CarrierAdapter, CarrierCredentials, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

const PAC = 'https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json'

type PacResponse = { services?: { service?: { code?: string; name?: string; price?: string | number }[] | { code?: string; name?: string; price?: string | number } }; error?: { errorMessage?: string } }

const asList = <T>(v: T[] | T | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : [])

/**
 * Australia Post. Rates use the Postage Assessment Calculator (PAC): free, one API key (header AUTH-KEY),
 * one parcel per call, so a multi-parcel cart is priced per parcel and summed, keeping only services
 * every parcel can use.
 *
 * Labels use the Shipping and Mailing API (see auspost-labels.ts): account number, ShipPing API key and
 * password. Test mode refuses to buy a label, so a trial never creates a real shipment.
 */
export class AusPostAdapter implements CarrierAdapter {
  readonly id = 'auspost' as const

  private async price(key: string, from: string, to: string, p: { lengthCm: number; widthCm: number; heightCm: number; weightKg: number }) {
    const q = new URLSearchParams({
      from_postcode: from,
      to_postcode: to,
      length: String(Math.max(1, Math.round(p.lengthCm))),
      width: String(Math.max(1, Math.round(p.widthCm))),
      height: String(Math.max(1, Math.round(p.heightCm))),
      weight: String(Math.max(0.01, p.weightKg)),
    })
    const res = await fetchJson<PacResponse>(`${PAC}?${q.toString()}`, { headers: { 'AUTH-KEY': key, Accept: 'application/json' } })
    if (res.status === 401 || res.status === 403) throw new Error('Australia Post did not accept the PAC API key.')
    if (!res.ok) throw new Error(res.body?.error?.errorMessage || `Australia Post answered ${res.status}.`)
    return asList(res.body?.services?.service)
  }

  private async testPac(key: string): Promise<ConnectionResult> {
    try {
      const services = await this.price(key, '3000', '2000', { lengthCm: 22, widthCm: 16, heightCm: 8, weightKg: 1 })
      return services.length > 0 ? { ok: true, message: `Connected. Australia Post returned ${services.length} service(s) for a test parcel.` } : { ok: false, message: 'Connected, but Australia Post returned no services for the test parcel.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach Australia Post.' }
    }
  }

  private async testLabelAccount(values: Record<string, string>): Promise<ConnectionResult> {
    const missing = missingLabelKeys(values)
    if (missing.length > 0) return { ok: false, message: `Labels need ${missing.map((k) => LABEL_KEY_NAMES[k]).join(', ')}. Fill them in and save first.` }
    try {
      return await checkAusPostAccount(labelCredsFrom(values))
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach Australia Post.' }
    }
  }

  /** Checks the PAC key when it is saved, and the Shipping and Mailing account when any label key is saved. */
  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    const key = creds.values.pacKey?.trim() ?? ''
    const labels = hasAnyLabelKey(creds.values)
    if (!key && !labels) return { ok: false, message: 'Enter the PAC API key first.' }
    const parts: ConnectionResult[] = []
    if (key) parts.push(await this.testPac(key))
    if (labels) parts.push(await this.testLabelAccount(creds.values))
    return { ok: parts.every((p) => p.ok), message: parts.map((p) => p.message).join(' ') }
  }

  async getRates(creds: CarrierCredentials, request: RateRequest): Promise<RateQuote[]> {
    const key = creds.values.pacKey?.trim()
    if (!key) throw new Error('No PAC API key.')
    const to = request.destination
    const from = request.origin
    if ((to.country ?? 'AU').toUpperCase() !== 'AU') throw new Error('Australia Post PAC here covers Australian destinations only.')
    if (!from.postcode || !to.postcode) throw new Error('A postcode is needed on both addresses.')
    const totals = new Map<string, { name: string; cents: number; seen: number }>()
    for (const parcel of request.parcels) {
      for (const s of await this.price(key, from.postcode, to.postcode, parcel)) {
        if (!s.code) continue
        const cents = Math.round(Number(s.price) * 100)
        if (!Number.isFinite(cents)) continue
        const cur = totals.get(s.code) ?? { name: s.name ?? s.code, cents: 0, seen: 0 }
        cur.cents += cents
        cur.seen += 1
        totals.set(s.code, cur)
      }
    }
    return [...totals.entries()]
      .filter(([, v]) => v.seen === request.parcels.length)
      .map(([code, v]) => ({ carrier: 'auspost' as const, serviceCode: code, serviceName: v.name, costCents: v.cents, etaDays: null as number | null }))
  }

  /** Buys one label through the Shipping and Mailing API. Refuses in test mode, so a trial never ships for real. */
  async createLabel(creds: CarrierCredentials, request: LabelRequest): Promise<LabelResult> {
    const missing = missingLabelKeys(creds.values)
    if (missing.length > 0) throw new Error(`Enter the ${missing.map((k) => LABEL_KEY_NAMES[k]).join(', ')} first.`)
    if (creds.testMode) throw new Error('Test mode is on for Australia Post, so no real label was bought. Switch test mode off in Shop settings > Shipping to buy labels.')
    return createAusPostLabel({ creds: labelCredsFrom(creds.values), request })
  }
}