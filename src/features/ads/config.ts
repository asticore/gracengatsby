/**
 * The Ads settings, units and placements as the rest of the code uses them.
 *
 * Every value is read through here, from a raw engine document or a raw D1
 * row, and comes out already validated (see validate.ts) with a default for
 * anything missing. On a fresh install there is no row at all, so a read of
 * `undefined` must give a complete, switched-off configuration.
 */

import { ADAPTERS, sanitiseParams, type BidderParams } from './adapters'
import {
  BREAKPOINTS,
  MAX_REFRESH_SECONDS,
  MAX_FLOOR_PRICE,
  MAX_TIMEOUT_MS,
  MIN_REFRESH_SECONDS,
  MIN_TIMEOUT_MS,
  PLACEMENT_MODES,
  type Breakpoint,
  type PlacementMode,
  type Size,
  type TargetingPair,
  clampNumber,
  isAdKey,
  isAdsenseSlot,
  isGamNetworkCode,
  isGamPath,
  normalisePublisherId,
  parsePrebidUrl,
  parseTargeting,
  sizesOrEmpty,
  PARAM_ID_PATTERN,
} from './validate'

export const PRICE_GRANULARITIES = ['low', 'medium', 'high', 'auto', 'dense'] as const
export type PriceGranularity = (typeof PRICE_GRANULARITIES)[number]
export const GDPR_MODES = ['region', 'always', 'never'] as const
export type GdprMode = (typeof GDPR_MODES)[number]

export type BidderEntry = { enabled: boolean; params: BidderParams; sellerId: string }

export type AdsSettings = {
  /** The Ads feature flag in Site Settings. Off on a fresh install. */
  enabled: boolean
  general: { showLabel: boolean; label: string }
  adsense: { enabled: boolean; publisherId: string | null; autoAds: boolean }
  gam: { enabled: boolean; networkCode: string | null; publisherId: string | null; singleRequest: boolean }
  prebid: {
    enabled: boolean
    scriptUrl: string | null
    scriptOrigin: string | null
    timeoutMs: number
    failsafeMs: number
    priceGranularity: PriceGranularity
    userSync: boolean
    userSyncDelayMs: number
    bidders: Record<string, BidderEntry>
  }
  privacy: { gdprMode: GdprMode; tcfTimeoutMs: number }
  adsTxt: { generate: boolean }
}

export const DEFAULT_LABEL = 'Advertisement'

export const emptyBidders = (): Record<string, BidderEntry> =>
  Object.fromEntries(ADAPTERS.map((a) => [a.code, { enabled: false, params: {}, sellerId: '' } as BidderEntry]))

export const DEFAULT_ADS_SETTINGS: AdsSettings = {
  enabled: false,
  general: { showLabel: true, label: DEFAULT_LABEL },
  adsense: { enabled: false, publisherId: null, autoAds: false },
  gam: { enabled: false, networkCode: null, publisherId: null, singleRequest: true },
  prebid: {
    enabled: false,
    scriptUrl: null,
    scriptOrigin: null,
    timeoutMs: 1000,
    failsafeMs: 3000,
    priceGranularity: 'medium',
    userSync: true,
    userSyncDelayMs: 3000,
    bidders: emptyBidders(),
  },
  privacy: { gdprMode: 'region', tcfTimeoutMs: 1500 },
  adsTxt: { generate: true },
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : v === 1 || v === '1' ? true : v === 0 || v === '0' ? false : fallback)
const oneLine = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '')

function parseJsonObject(v: unknown): Record<string, unknown> {
  if (typeof v === 'string') {
    if (!v.trim() || v.length > 20_000) return {}
    try {
      return asRecord(JSON.parse(v))
    } catch {
      return {}
    }
  }
  return asRecord(v)
}

export function normaliseBidders(raw: unknown): Record<string, BidderEntry> {
  const source = parseJsonObject(raw)
  const out = emptyBidders()
  for (const adapter of ADAPTERS) {
    const entry = asRecord(source[adapter.code])
    const sellerRaw = typeof entry.sellerId === 'number' ? String(entry.sellerId) : entry.sellerId
    const seller = typeof sellerRaw === 'string' && PARAM_ID_PATTERN.test(sellerRaw.trim()) ? sellerRaw.trim() : ''
    out[adapter.code] = { enabled: entry.enabled === true, params: sanitiseParams(adapter.code, entry.params), sellerId: seller }
  }
  return out
}

/** Builds settings from a nested document (engine) with the feature flag given separately. */
export function normaliseAdsSettings(raw: unknown, featureEnabled: boolean): AdsSettings {
  const doc = asRecord(raw)
  const general = asRecord(doc.general)
  const adsense = asRecord(doc.adsense)
  const gam = asRecord(doc.gam)
  const prebid = asRecord(doc.prebid)
  const privacy = asRecord(doc.privacy)
  const adsTxt = asRecord(doc.adsTxt)
  const d = DEFAULT_ADS_SETTINGS

  const url = parsePrebidUrl(prebid.scriptUrl)
  const granularity = (PRICE_GRANULARITIES as readonly unknown[]).includes(prebid.priceGranularity) ? (prebid.priceGranularity as PriceGranularity) : d.prebid.priceGranularity
  const gdprMode = (GDPR_MODES as readonly unknown[]).includes(privacy.gdprMode) ? (privacy.gdprMode as GdprMode) : d.privacy.gdprMode
  const networkCode = isGamNetworkCode(gam.networkCode) ? gam.networkCode.trim() : null
  const gamPub = normalisePublisherId(gam.publisherId)

  return {
    enabled: featureEnabled,
    general: { showLabel: bool(general.showLabel, d.general.showLabel), label: oneLine(general.label, 40) || DEFAULT_LABEL },
    adsense: { enabled: bool(adsense.enabled, false), publisherId: normalisePublisherId(adsense.publisherId), autoAds: bool(adsense.autoAds, false) },
    gam: { enabled: bool(gam.enabled, false), networkCode, publisherId: gamPub, singleRequest: bool(gam.singleRequest, true) },
    prebid: {
      enabled: bool(prebid.enabled, false),
      scriptUrl: url?.url ?? null,
      scriptOrigin: url?.origin ?? null,
      timeoutMs: Math.round(clampNumber(prebid.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, d.prebid.timeoutMs)),
      failsafeMs: Math.round(clampNumber(prebid.failsafeMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS * 2, d.prebid.failsafeMs)),
      priceGranularity: granularity,
      userSync: bool(prebid.userSync, true),
      userSyncDelayMs: Math.round(clampNumber(prebid.userSyncDelayMs, 0, MAX_TIMEOUT_MS, d.prebid.userSyncDelayMs)),
      bidders: normaliseBidders(prebid.bidders),
    },
    privacy: { gdprMode, tcfTimeoutMs: Math.round(clampNumber(privacy.tcfTimeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, d.privacy.tcfTimeoutMs)) },
    adsTxt: { generate: bool(adsTxt.generate, true) },
  }
}

const GROUPS: Record<string, string[]> = {
  general: ['showLabel', 'label'],
  adsense: ['enabled', 'publisherId', 'autoAds'],
  gam: ['enabled', 'networkCode', 'publisherId', 'singleRequest'],
  prebid: ['enabled', 'scriptUrl', 'timeoutMs', 'failsafeMs', 'priceGranularity', 'userSync', 'userSyncDelayMs', 'bidders'],
  privacy: ['gdprMode', 'tcfTimeoutMs'],
  adsTxt: ['generate'],
}
const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Turns a raw `eg_ad_settings` row (flat, snake_case, group-prefixed) into the nested document shape. */
export function nestSettingsRow(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, Record<string, unknown>> = {}
  if (!row) return out
  for (const [group, fields] of Object.entries(GROUPS)) {
    out[group] = {}
    for (const field of fields) out[group][field] = row[`${snake(group)}_${snake(field)}`]
  }
  return out
}

// --- Units and placements ---------------------------------------------------

export type AdUnit = {
  key: string
  name: string
  network: 'adsense' | 'gam'
  enabled: boolean
  slotId: string | null
  gamPath: string | null
  sizes: Record<Breakpoint, Size[]>
  floorPrice: number | null
  lazyLoad: boolean
  refresh: { seconds: number; viewableOnly: boolean; max: number } | null
  targeting: TargetingPair[]
  /** Offer this unit to the Prebid bidders (Ad Manager units only). */
  prebid: boolean
  bidderParams: Record<string, BidderParams>
  /** adsense: fill the width of the container. */
  responsive: boolean
}

export function normaliseUnit(raw: unknown): AdUnit | null {
  const doc = asRecord(raw)
  if (!isAdKey(doc.key)) return null
  const network = doc.network === 'adsense' || doc.network === 'gam' ? doc.network : null
  if (!network) return null
  const overrides = parseJsonObject(doc.bidderParams)
  const bidderParams: Record<string, BidderParams> = {}
  for (const adapter of ADAPTERS) if (overrides[adapter.code]) bidderParams[adapter.code] = sanitiseParams(adapter.code, overrides[adapter.code])

  const refreshOn = network === 'gam' && doc.refreshEnabled === true
  const floorRaw = typeof doc.floorPrice === 'number' ? doc.floorPrice : NaN
  return {
    key: doc.key,
    name: oneLine(doc.name, 120) || doc.key,
    network,
    enabled: doc.enabled !== false,
    slotId: isAdsenseSlot(doc.slotId) ? doc.slotId.trim() : null,
    gamPath: isGamPath(doc.gamPath) ? doc.gamPath.trim() : null,
    sizes: { mobile: sizesOrEmpty(doc.sizesMobile), tablet: sizesOrEmpty(doc.sizesTablet), desktop: sizesOrEmpty(doc.sizesDesktop) },
    floorPrice: Number.isFinite(floorRaw) && floorRaw > 0 ? Math.min(floorRaw, MAX_FLOOR_PRICE) : null,
    lazyLoad: doc.lazyLoad !== false,
    refresh: refreshOn
      ? {
          seconds: Math.round(clampNumber(doc.refreshSeconds, MIN_REFRESH_SECONDS, MAX_REFRESH_SECONDS, 60)),
          viewableOnly: doc.refreshRequireViewable !== false,
          max: Math.round(clampNumber(doc.refreshMax, 1, 50, 10)),
        }
      : null,
    targeting: parseTargeting(doc.targeting).pairs,
    prebid: network === 'gam' && doc.prebid === true,
    bidderParams,
    responsive: doc.adsenseResponsive !== false,
  }
}

export type AdPlacement = {
  key: string
  name: string
  unit: string
  mode: PlacementMode
  enabled: boolean
  afterParagraph: number
  repeatEvery: number
  maxPerPage: number
  feedEvery: number
  onPages: boolean
  onPosts: boolean
  onProducts: boolean
}

/** `unitKeyById` maps a unit id (the relationship value) to its key. */
export function normalisePlacement(raw: unknown, unitKeyById: ReadonlyMap<number, string>): AdPlacement | null {
  const doc = asRecord(raw)
  if (!isAdKey(doc.key)) return null
  const mode = (PLACEMENT_MODES as readonly unknown[]).includes(doc.mode) ? (doc.mode as PlacementMode) : null
  if (!mode) return null
  const unitRaw = doc.unit
  const unitId = typeof unitRaw === 'number' ? unitRaw : typeof unitRaw === 'object' && unitRaw ? Number((unitRaw as { id?: unknown }).id) : NaN
  const unit = typeof unitRaw === 'object' && unitRaw && isAdKey((unitRaw as { key?: unknown }).key) ? String((unitRaw as { key: string }).key) : unitKeyById.get(unitId)
  if (!unit) return null
  return {
    key: doc.key,
    name: oneLine(doc.name, 120) || doc.key,
    unit,
    mode,
    enabled: doc.enabled !== false,
    afterParagraph: Math.round(clampNumber(doc.afterParagraph, 1, 50, 3)),
    repeatEvery: Math.round(clampNumber(doc.repeatEvery, 0, 50, 0)),
    maxPerPage: Math.round(clampNumber(doc.maxPerPage, 1, 10, 3)),
    feedEvery: Math.round(clampNumber(doc.feedEvery, 2, 50, 6)),
    onPages: doc.onPages !== false,
    onPosts: doc.onPosts !== false,
    onProducts: doc.onProducts !== false,
  }
}

export const BREAKPOINT_MIN_WIDTH: Record<Breakpoint, number> = { mobile: 0, tablet: 768, desktop: 1024 }

/** Which breakpoint a viewport width falls in. */
export const breakpointFor = (width: number): Breakpoint => (width >= BREAKPOINT_MIN_WIDTH.desktop ? 'desktop' : width >= BREAKPOINT_MIN_WIDTH.tablet ? 'tablet' : 'mobile')

/** Sizes to use at a breakpoint: its own, else the nearest breakpoint that has any. */
export function sizesAt(sizes: Record<Breakpoint, Size[]>, breakpoint: Breakpoint): Size[] {
  const order: Record<Breakpoint, Breakpoint[]> = {
    mobile: ['mobile', 'tablet', 'desktop'],
    tablet: ['tablet', 'mobile', 'desktop'],
    desktop: ['desktop', 'tablet', 'mobile'],
  }
  for (const candidate of order[breakpoint]) if (sizes[candidate].length > 0) return sizes[candidate]
  return []
}

export { BREAKPOINTS }
