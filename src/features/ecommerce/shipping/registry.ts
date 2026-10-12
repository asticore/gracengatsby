import { toCents } from '../lib/money'
import type { ShippingOption } from '../lib/shipping'
import { AusPostAdapter } from './auspost'
import { CARRIERS, carrierDef, missingCredentialKeys } from './catalogue'
import { normalisePresets, packItems, type PackItem, type PackagePreset } from './packing'
import { SendleAdapter } from './sendle'
import type { Address, CarrierAdapter, CarrierCredentials, CarrierId, ConnectionResult, LabelRequest, LabelResult, RateQuote, RateRequest } from './types'

/** Carriers with no built-in API calls yet: settings and key checks only. */
class KeysOnlyAdapter implements CarrierAdapter {
  constructor(readonly id: CarrierId) {}
  async testConnection(creds: CarrierCredentials): Promise<ConnectionResult> {
    const def = carrierDef(this.id)
    const missing = def ? missingCredentialKeys(def, creds.values) : []
    if (missing.length > 0) return { ok: false, message: `Missing: ${missing.join(', ')}.` }
    return { ok: true, message: `Keys saved. Live calls to ${def?.label ?? this.id} are not built in yet, so orders use your zone rates and you record tracking numbers by hand.` }
  }
  async getRates(): Promise<RateQuote[]> {
    throw new Error('Live rates are not built in for this carrier yet.')
  }
  async createLabel(): Promise<LabelResult> {
    throw new Error('Buying labels is not built in for this carrier yet. Buy it in the carrier account and record the tracking number on the order.')
  }
}

const overrides = new Map<string, CarrierAdapter>()

/** Tests (and local trials) can replace any carrier with another adapter, such as the mock. */
export function setAdapterOverride(id: CarrierId, adapter: CarrierAdapter | null): void {
  if (adapter) overrides.set(id, adapter)
  else overrides.delete(id)
}

export function getAdapter(id: CarrierId): CarrierAdapter {
  const o = overrides.get(id)
  if (o) return o
  if (id === 'auspost') return new AusPostAdapter()
  if (id === 'sendle') return new SendleAdapter()
  return new KeysOnlyAdapter(id)
}

type Loose = Record<string, unknown>
const obj = (v: unknown): Loose => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const groupName = (id: string): string => `carrier${id.charAt(0).toUpperCase()}${id.slice(1)}`

export type ShippingConfig = {
  origin: Address
  liveRates: boolean
  /** dollars added to every live rate */
  handlingFlat: number
  /** percent added to every live rate */
  handlingPct: number
  taxable: boolean
  presets: PackagePreset[]
  carriers: { id: CarrierId; enabled: boolean; creds: CarrierCredentials }[]
}

/** Reads the shipping-settings global (already decrypted by the engine) into one tidy object. */
export function normaliseShippingConfig(doc: unknown): ShippingConfig {
  const d = obj(doc)
  const o = obj(d.origin)
  const rates = obj(d.rates)
  const carriers = CARRIERS.map((def) => {
    const g = obj(d[groupName(def.id)])
    const values: Record<string, string> = {}
    for (const f of def.fields) values[f.key] = str(g[f.key])
    return { id: def.id as CarrierId, enabled: g.enabled === true, creds: { values, testMode: g.testMode !== false } }
  })
  return {
    origin: { name: str(o.name), company: str(o.company), line1: str(o.line1), line2: str(o.line2), city: str(o.city), state: str(o.state), postcode: str(o.postcode), country: str(o.country) || 'AU', phone: str(o.phone), email: str(o.email) },
    liveRates: rates.liveRates === true,
    handlingFlat: typeof rates.handlingFlat === 'number' && rates.handlingFlat > 0 ? rates.handlingFlat : 0,
    handlingPct: typeof rates.handlingPct === 'number' && rates.handlingPct > 0 ? rates.handlingPct : 0,
    taxable: rates.taxable !== false,
    presets: normalisePresets(d.packages),
    carriers,
  }
}

export const originComplete = (o: Address): boolean => Boolean(o.line1 && o.city && o.postcode && o.country)

export type LiveRateOutcome = { options: ShippingOption[]; errors: { carrier: string; message: string }[]; attempted: number }

export const LIVE_PREFIX = 'live:'

/** `live:<carrier>:<serviceCode>` - what the browser sends back and the server re-validates. */
export const liveOptionId = (carrier: string, serviceCode: string): string => `${LIVE_PREFIX}${carrier}:${serviceCode}`

export function parseLiveOptionId(id: string | null | undefined): { carrier: string; serviceCode: string } | null {
  if (!id || !id.startsWith(LIVE_PREFIX)) return null
  const rest = id.slice(LIVE_PREFIX.length)
  const i = rest.indexOf(':')
  if (i <= 0) return null
  return { carrier: rest.slice(0, i), serviceCode: rest.slice(i + 1) }
}

export function withHandling(cents: number, cfg: Pick<ShippingConfig, 'handlingFlat' | 'handlingPct'>): number {
  return Math.round(cents * (1 + cfg.handlingPct / 100)) + toCents(cfg.handlingFlat)
}

/**
 * Asks every enabled, configured carrier for live rates and turns the answers into checkout
 * options. Never throws: a carrier that fails is reported in `errors` and simply contributes
 * nothing, so the caller can fall back to zone rates when `options` is empty.
 */
export async function fetchLiveRates(config: ShippingConfig, args: { destination: Address; items: PackItem[]; declaredValueCents?: number; adapterFor?: (id: CarrierId) => CarrierAdapter }): Promise<LiveRateOutcome> {
  const outcome: LiveRateOutcome = { options: [], errors: [], attempted: 0 }
  if (!config.liveRates || !originComplete(config.origin)) return outcome
  const parcels = packItems(args.items, config.presets)
  if (parcels.length === 0) return outcome
  const request: RateRequest = { origin: config.origin, destination: args.destination, parcels, declaredValueCents: args.declaredValueCents }
  const adapterFor = args.adapterFor ?? getAdapter
  const results = await Promise.all(
    config.carriers
      .filter((c) => c.enabled)
      .map(async (c) => {
        const def = carrierDef(c.id)
        const adapter = adapterFor(c.id)
        const isMock = adapter.id === 'mock'
        if (!isMock && def && !def.live.rates) return null
        outcome.attempted += 1
        try {
          const quotes = await adapter.getRates(c.creds, request)
          return { c, quotes }
        } catch (error) {
          outcome.errors.push({ carrier: c.id, message: error instanceof Error ? error.message : 'Rate request failed.' })
          return null
        }
      }),
  )
  for (const r of results) {
    if (!r) continue
    const label = carrierDef(r.c.id)?.label ?? r.c.id
    for (const q of r.quotes) {
      if (!Number.isInteger(q.costCents) || q.costCents < 0) continue
      outcome.options.push({
        id: liveOptionId(r.c.id, q.serviceCode),
        zoneId: 'live',
        zoneName: label,
        type: 'flat',
        title: `${label} ${q.serviceName.replace(new RegExp(`^${label}\\s*`, 'i'), '')}${q.etaDays ? ` (about ${q.etaDays} day${q.etaDays === 1 ? '' : 's'})` : ''}`.trim(),
        costCents: withHandling(q.costCents, config),
        taxable: config.taxable,
      })
    }
  }
  outcome.options.sort((a, b) => a.costCents - b.costCents)
  return outcome
}

/**
 * Combines live options with the zone options. Live carrier rates replace the zone's paid options;
 * a zone's local pickup and free-over-threshold options are kept, because they are not carrier
 * prices. With no live options at all the zone options are returned unchanged (the fall-back).
 */
export function mergeShippingOptions(zoneOptions: ShippingOption[], live: ShippingOption[]): ShippingOption[] {
  if (live.length === 0) return zoneOptions
  const keep = zoneOptions.filter((o) => o.type === 'local_pickup' || o.type === 'free_over_amount')
  return [...live, ...keep]
}

export type { LabelRequest }
