/**
 * Pure builders: nothing here touches the DOM, the request or the database.
 *
 *  - the public config object handed to the browser runtime
 *  - Prebid and GPT configuration
 *  - ads.txt lines and the merge with the editor's own lines
 *  - the Content-Security-Policy additions
 *  - reserved-space (no layout shift) heights
 */

import { ADAPTERS, adsTxtLineFor, getAdapter, type BidderParams } from './adapters'
import { sizesAt, type AdsSettings, type AdUnit } from './config'
import { adsTxtPublisherId, type Breakpoint, type Size, type TargetingPair } from './validate'

// --- Embedding config safely -----------------------------------------------

/**
 * JSON for a `<script type="application/json">` body. `<`, `>` and `&` are
 * written as unicode escapes so a value can never close the script element
 * (`</script>`) or open a comment (`<!--`), and the two line separators that
 * older engines treat as newlines inside strings are escaped too.
 */
export function safeJson(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029')
}

// --- Reserved space -----------------------------------------------------------

export type ReservedSpace = { mobile: number; tablet: number; desktop: number; maxWidth: number }

const FALLBACK_HEIGHT = 250

/** The tallest size at each breakpoint, so the slot never grows after an ad arrives. */
export function reservedSpace(unit: Pick<AdUnit, 'sizes'>): ReservedSpace {
  const tallest = (breakpoint: Breakpoint): number => {
    const sizes = sizesAt(unit.sizes, breakpoint)
    return sizes.length ? Math.max(...sizes.map((s) => s[1])) : FALLBACK_HEIGHT
  }
  const all = [...unit.sizes.mobile, ...unit.sizes.tablet, ...unit.sizes.desktop]
  return { mobile: tallest('mobile'), tablet: tallest('tablet'), desktop: tallest('desktop'), maxWidth: all.length ? Math.max(...all.map((s) => s[0])) : 0 }
}

// --- Public (browser) config ------------------------------------------------

export type PublicBid = { bidder: string; params: BidderParams }

export type PublicUnit = {
  key: string
  network: 'adsense' | 'gam'
  slot?: string
  path?: string
  sizes: Record<Breakpoint, Size[]>
  floor?: number
  lazy: boolean
  refresh?: { seconds: number; viewable: boolean; max: number }
  targeting: TargetingPair[]
  bids: PublicBid[]
  /** Amazon TAM publisher id, when the unit is offered to TAM. */
  tam?: string
  responsive: boolean
}

export type PublicConfig = {
  v: 1
  adsense: { client: string; auto: boolean } | null
  gam: { network: string; single: boolean } | null
  prebid: null | {
    url: string
    timeout: number
    failsafe: number
    granularity: string
    userSync: boolean
    userSyncDelay: number
  }
  tam: { pubId: string } | null
  privacy: { gdpr: 'region' | 'always' | 'never'; tcfTimeout: number }
  track: boolean
  units: Record<string, PublicUnit>
}

/** The GAM ad unit path for a unit: its own, else `/network/key`. */
export function gamPathFor(unit: Pick<AdUnit, 'gamPath' | 'key'>, networkCode: string | null): string | null {
  if (unit.gamPath) return unit.gamPath
  return networkCode ? `/${networkCode}/${unit.key}` : null
}

/** Bidders a unit is offered to, with settings defaults merged under the unit's own overrides. */
export function bidsForUnit(unit: AdUnit, settings: AdsSettings): PublicBid[] {
  if (!unit.prebid || !settings.prebid.enabled) return []
  const bids: PublicBid[] = []
  for (const adapter of ADAPTERS) {
    if (adapter.kind !== 'prebid') continue
    const entry = settings.prebid.bidders[adapter.code]
    if (!entry?.enabled) continue
    const params = { ...entry.params, ...(unit.bidderParams[adapter.code] ?? {}) }
    // A bidder missing a required param would only produce errors in the console and wasted requests.
    if (adapter.params.some((p) => p.required && params[p.name] === undefined)) continue
    bids.push({ bidder: adapter.code, params })
  }
  return bids
}

export function buildPublicConfig(settings: AdsSettings, units: AdUnit[]): PublicConfig | null {
  if (!settings.enabled) return null
  const adsenseOn = settings.adsense.enabled && settings.adsense.publisherId !== null
  const gamOn = settings.gam.enabled && settings.gam.networkCode !== null
  const prebidOn = settings.prebid.enabled && settings.prebid.scriptUrl !== null && gamOn
  const tamEntry = settings.prebid.bidders.amazon
  const tamOn = Boolean(tamEntry?.enabled && tamEntry.params.pubID !== undefined && gamOn)
  if (!adsenseOn && !gamOn) return null

  const out: Record<string, PublicUnit> = {}
  for (const unit of units) {
    if (!unit.enabled) continue
    if (unit.network === 'adsense' && (!adsenseOn || !unit.slotId)) continue
    if (unit.network === 'gam' && (!gamOn || !gamPathFor(unit, settings.gam.networkCode))) continue
    const pub: PublicUnit = {
      key: unit.key,
      network: unit.network,
      sizes: unit.sizes,
      lazy: unit.lazyLoad,
      targeting: unit.targeting,
      bids: prebidOn ? bidsForUnit(unit, settings) : [],
      responsive: unit.responsive,
    }
    if (unit.network === 'adsense') pub.slot = unit.slotId ?? undefined
    else pub.path = gamPathFor(unit, settings.gam.networkCode) ?? undefined
    if (unit.floorPrice) pub.floor = unit.floorPrice
    if (unit.refresh) pub.refresh = { seconds: unit.refresh.seconds, viewable: unit.refresh.viewableOnly, max: unit.refresh.max }
    if (tamOn && unit.network === 'gam' && unit.prebid) pub.tam = String(tamEntry.params.pubID)
    out[unit.key] = pub
  }

  return {
    v: 1,
    adsense: adsenseOn ? { client: settings.adsense.publisherId as string, auto: settings.adsense.autoAds } : null,
    gam: gamOn ? { network: settings.gam.networkCode as string, single: settings.gam.singleRequest } : null,
    prebid: prebidOn
      ? {
          url: settings.prebid.scriptUrl as string,
          timeout: settings.prebid.timeoutMs,
          failsafe: settings.prebid.failsafeMs,
          granularity: settings.prebid.priceGranularity,
          userSync: settings.prebid.userSync,
          userSyncDelay: settings.prebid.userSyncDelayMs,
        }
      : null,
    tam: tamOn ? { pubId: String(tamEntry.params.pubID) } : null,
    privacy: { gdpr: settings.privacy.gdprMode, tcfTimeout: settings.privacy.tcfTimeoutMs },
    track: true,
    units: out,
  }
}

// --- Prebid and GPT ------------------------------------------------------------

export type PrebidConsentManagement = { gdpr: { cmpApi: 'iab'; timeout: number; defaultGdprScope: boolean } }

/**
 * Consent management for Prebid. Only wired when a TCF CMP is present on the
 * page (`window.__tcfapi`): without one there is no TC string to read, and
 * inventing one would claim a consent that was never recorded. In that case
 * nothing is passed and the runtime logs why (see runtime.ts).
 */
export function prebidConsentManagement(options: { gdprApplies: boolean; hasTcfApi: boolean; timeout: number }): PrebidConsentManagement | undefined {
  if (!options.gdprApplies || !options.hasTcfApi) return undefined
  return { gdpr: { cmpApi: 'iab', timeout: options.timeout, defaultGdprScope: true } }
}

export function buildPrebidSetConfig(
  config: NonNullable<PublicConfig['prebid']>,
  units: PublicUnit[],
  consent?: PrebidConsentManagement,
): Record<string, unknown> {
  const floors: Record<string, number> = {}
  for (const unit of units) if (unit.floor) floors[unit.key] = unit.floor
  const out: Record<string, unknown> = {
    priceGranularity: config.granularity,
    bidderTimeout: config.timeout,
    enableSendAllBids: false,
    userSync: {
      syncEnabled: config.userSync,
      syncsPerBidder: 5,
      syncDelay: config.userSyncDelay,
      filterSettings: { all: { bidders: '*', filter: 'include' } },
    },
  }
  // Needs the Price Floors module in the Prebid build; ignored with a console warning otherwise.
  if (Object.keys(floors).length) {
    out.floors = { enforcement: { floorDeals: false }, data: { currency: 'USD', schema: { fields: ['adUnitCode'] }, values: floors, default: 0 } }
  }
  if (consent) out.consentManagement = consent
  return out
}

/** One Prebid ad unit for one rendered slot. `divId` is the slot's DOM id and the GPT slot code. */
export function buildPrebidAdUnit(unit: PublicUnit, divId: string, sizes: Size[]) {
  return {
    code: divId,
    mediaTypes: { banner: { sizes: sizes.map((s) => [s[0], s[1]]) } },
    bids: unit.bids.map((b) => ({ bidder: b.bidder, params: b.params })),
  }
}

/** What `googletag.defineSlot` needs, plus the targeting to apply. */
export function buildGptSlot(unit: PublicUnit, divId: string, sizes: Size[]) {
  return { path: unit.path as string, sizes: sizes.map((s) => [s[0], s[1]]), divId, targeting: unit.targeting }
}

export function buildTamSlot(unit: PublicUnit, divId: string, sizes: Size[]) {
  return { slotID: divId, slotName: unit.path as string, sizes: sizes.map((s) => [s[0], s[1]]) }
}

// --- ads.txt -------------------------------------------------------------------

export const GOOGLE_ADS_TXT_CERT = 'f08c47fec0942fa0'
export const ADS_TXT_MARKER = '# Added automatically from the Ads settings. Change them there, not here.'

/** Lines generated from the enabled networks and bidders. Empty when nothing qualifies. */
export function buildAdsTxtLines(settings: AdsSettings): string[] {
  if (!settings.enabled || !settings.adsTxt.generate) return []
  const lines: string[] = []
  const push = (line: string | null) => {
    if (line && !lines.includes(line)) lines.push(line)
  }
  const googleId = settings.adsense.enabled ? settings.adsense.publisherId : null
  const gamId = settings.gam.enabled ? settings.gam.publisherId ?? settings.adsense.publisherId : null
  for (const id of [googleId, gamId]) {
    if (id) push(`google.com, ${adsTxtPublisherId(id)}, DIRECT, ${GOOGLE_ADS_TXT_CERT}`)
  }
  if (settings.prebid.enabled || settings.gam.enabled) {
    for (const adapter of ADAPTERS) {
      const entry = settings.prebid.bidders[adapter.code]
      if (!entry?.enabled || !entry.sellerId) continue
      push(adsTxtLineFor(adapter.code, entry.sellerId))
    }
  }
  return lines
}

const lineIdentity = (line: string): string | null => {
  const content = line.split('#')[0]?.trim() ?? ''
  if (!content) return null
  const parts = content.split(',').map((p) => p.trim().toLowerCase())
  if (parts.length < 3) return null
  return `${parts[0]}|${parts[1]}|${parts[2]}`
}

/**
 * Appends generated lines to the editor's ads.txt without touching a single
 * line of theirs. A generated line the editor already wrote (same domain,
 * account and relationship, whatever the spacing or case) is not repeated.
 * Returns null when there is nothing to serve.
 */
export function mergeAdsTxt(userText: string | null | undefined, generated: readonly string[]): string | null {
  const user = typeof userText === 'string' ? userText.replace(/\r\n?/g, '\n').trim() : ''
  const present = new Set(user.split('\n').map(lineIdentity).filter((x): x is string => x !== null))
  const fresh = generated.filter((line) => {
    const id = lineIdentity(line)
    return id !== null && !present.has(id)
  })
  if (!user && fresh.length === 0) return null
  const parts: string[] = []
  if (user) parts.push(user)
  if (fresh.length) {
    if (user && !user.includes(ADS_TXT_MARKER)) parts.push('', ADS_TXT_MARKER)
    else if (!user) parts.push(ADS_TXT_MARKER)
    parts.push(...fresh)
  }
  return `${parts.join('\n')}\n`
}

// --- Content-Security-Policy ---------------------------------------------------

const GOOGLE_SCRIPT = ['https://securepubads.g.doubleclick.net', 'https://www.googletagservices.com', 'https://pagead2.googlesyndication.com', 'https://partner.googleadservices.com', 'https://adservice.google.com', 'https://tpc.googlesyndication.com']
const GOOGLE_FRAME = ['https://googleads.g.doubleclick.net', 'https://securepubads.g.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.safeframe.googlesyndication.com', 'https://pagead2.googlesyndication.com']

export type CspAdditions = { script: string[]; frame: string[] }

/** Hosts the page needs for the enabled networks. Empty when ads are off. */
export function adsCspAdditions(settings: AdsSettings): CspAdditions {
  const add: CspAdditions = { script: [], frame: [] }
  if (!settings.enabled) return add
  const adsense = settings.adsense.enabled && settings.adsense.publisherId
  const gam = settings.gam.enabled && settings.gam.networkCode
  if (adsense || gam) {
    add.script.push(...GOOGLE_SCRIPT)
    add.frame.push(...GOOGLE_FRAME)
  }
  if (gam && settings.prebid.enabled && settings.prebid.scriptOrigin) add.script.push(settings.prebid.scriptOrigin)
  if (gam && settings.prebid.bidders.amazon?.enabled) add.script.push('https://c.amazon-adsystem.com')
  return { script: [...new Set(add.script)], frame: [...new Set(add.frame)] }
}

/**
 * Adds sources to the named directives of a policy string. A directive that is
 * missing but covered by `default-src` is created from it, so adding a host
 * never widens or narrows anything else. A policy with neither is left alone.
 */
export function extendCsp(policy: string, additions: CspAdditions): string {
  if (!additions.script.length && !additions.frame.length) return policy
  const directives = policy.split(';').map((d) => d.trim()).filter(Boolean)
  const find = (name: string) => directives.findIndex((d) => d.toLowerCase().split(/\s+/)[0] === name)
  const defaultIndex = find('default-src')
  const apply = (name: string, sources: string[]) => {
    if (!sources.length) return
    const index = find(name)
    let base: string[]
    if (index >= 0) base = directives[index]!.split(/\s+/).slice(1)
    else if (defaultIndex >= 0) base = directives[defaultIndex]!.split(/\s+/).slice(1)
    else return
    if (base.includes("'none'")) base = base.filter((s) => s !== "'none'")
    const merged = [...base, ...sources.filter((s) => !base.includes(s))]
    const text = `${name} ${merged.join(' ')}`
    if (index >= 0) directives[index] = text
    else directives.push(text)
  }
  apply('script-src', additions.script)
  apply('frame-src', additions.frame)
  return directives.join('; ')
}
