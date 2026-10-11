/**
 * Strict validation for everything an editor types that ends up in public
 * markup, a script, a request or a header.
 *
 * Nothing here is "sanitised by escaping": a value either matches a tight
 * pattern or it is rejected (or, for readers, dropped). That is what keeps
 * editor text out of script contexts - the runtime only ever receives values
 * that passed these patterns, JSON-encoded (see builders.safeJson).
 */

/** Unit and placement keys: they appear in data attributes, DOM ids and the tracking beacon. */
export const AD_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
/** `ca-pub-1234567890123456` (the form AdSense scripts use). */
export const ADSENSE_CLIENT_PATTERN = /^ca-pub-\d{10,20}$/
/** AdSense `data-ad-slot`. */
export const ADSENSE_SLOT_PATTERN = /^\d{6,20}$/
export const GAM_NETWORK_CODE_PATTERN = /^\d{4,12}$/
/** `/12345678/site/section/unit`, optionally `/12345678,987654/...` for child networks. */
export const GAM_PATH_PATTERN = /^\/\d{4,12}(?:,\d{4,12})?(?:\/[A-Za-z0-9_.-]{1,100}){1,8}$/
/** Safe identifier used for bidder params and seller ids. */
export const PARAM_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/
const TARGET_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,19}$/
const TARGET_VALUE_PATTERN = /^[A-Za-z0-9_.:+\- ]{1,40}$/

export const MAX_SIZES_PER_BREAKPOINT = 12
export const MAX_TARGETING_PAIRS = 20
export const MIN_REFRESH_SECONDS = 30
export const MAX_REFRESH_SECONDS = 600
export const MAX_FLOOR_PRICE = 1000
export const MIN_TIMEOUT_MS = 100
export const MAX_TIMEOUT_MS = 10_000

export type Size = readonly [number, number]
export type Breakpoint = 'mobile' | 'tablet' | 'desktop'
export const BREAKPOINTS: readonly Breakpoint[] = ['mobile', 'tablet', 'desktop']

export const isAdKey = (value: unknown): value is string => typeof value === 'string' && AD_KEY_PATTERN.test(value)

/** Accepts `ca-pub-123...` or `pub-123...`; returns the `ca-pub-` form, or null. */
export function normalisePublisherId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  const withPrefix = /^pub-\d+$/.test(trimmed) ? `ca-${trimmed}` : trimmed
  return ADSENSE_CLIENT_PATTERN.test(withPrefix) ? withPrefix : null
}

/** `ca-pub-123` -> `pub-123`, the form ads.txt uses. */
export const adsTxtPublisherId = (clientId: string): string => clientId.replace(/^ca-/, '')

export const isAdsenseSlot = (value: unknown): value is string => typeof value === 'string' && ADSENSE_SLOT_PATTERN.test(value.trim())
export const isGamNetworkCode = (value: unknown): value is string => typeof value === 'string' && GAM_NETWORK_CODE_PATTERN.test(value.trim())
export const isGamPath = (value: unknown): value is string => typeof value === 'string' && GAM_PATH_PATTERN.test(value.trim())

/**
 * "300x250, 320x50" (commas, spaces or newlines) -> sizes. Returns null with a
 * reason when anything is wrong; blank is a valid empty list.
 */
export function parseSizes(value: unknown): { sizes: Size[]; error: null } | { sizes: null; error: string } {
  if (value === null || value === undefined) return { sizes: [], error: null }
  if (typeof value !== 'string') return { sizes: null, error: 'Sizes must be text like 300x250, 320x50.' }
  const parts = value.split(/[\s,;]+/).filter(Boolean)
  if (parts.length > MAX_SIZES_PER_BREAKPOINT) return { sizes: null, error: `Use at most ${MAX_SIZES_PER_BREAKPOINT} sizes per breakpoint.` }
  const sizes: Size[] = []
  for (const part of parts) {
    const match = /^(\d{1,4})x(\d{1,4})$/i.exec(part)
    if (!match) return { sizes: null, error: `"${part.slice(0, 20)}" is not a size. Use WIDTHxHEIGHT, e.g. 300x250.` }
    const width = Number(match[1])
    const height = Number(match[2])
    if (width < 1 || height < 1 || width > 4000 || height > 4000) return { sizes: null, error: `Size ${part} is out of range (1 to 4000).` }
    if (!sizes.some((s) => s[0] === width && s[1] === height)) sizes.push([width, height])
  }
  return { sizes, error: null }
}

/** Reader form: invalid text yields no sizes rather than an error. */
export const sizesOrEmpty = (value: unknown): Size[] => parseSizes(value).sizes ?? []

export type TargetingPair = readonly [string, string[]]

/** `section=news` / `tags=a,b` per line -> pairs. Invalid lines are reported. */
export function parseTargeting(value: unknown): { pairs: TargetingPair[]; errors: string[] } {
  const pairs: TargetingPair[] = []
  const errors: string[] = []
  if (typeof value !== 'string' || !value.trim()) return { pairs, errors }
  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length > MAX_TARGETING_PAIRS) errors.push(`Use at most ${MAX_TARGETING_PAIRS} targeting lines.`)
  for (const line of lines.slice(0, MAX_TARGETING_PAIRS)) {
    const index = line.indexOf('=')
    if (index < 1) {
      errors.push(`"${line.slice(0, 30)}" needs the form key=value.`)
      continue
    }
    const key = line.slice(0, index).trim()
    const values = line.slice(index + 1).split(',').map((v) => v.trim()).filter(Boolean)
    if (!TARGET_KEY_PATTERN.test(key)) {
      errors.push(`Targeting key "${key.slice(0, 20)}" must start with a letter and use letters, digits or _ (max 20).`)
      continue
    }
    if (values.length === 0 || values.length > 10 || values.some((v) => !TARGET_VALUE_PATTERN.test(v))) {
      errors.push(`Targeting values for "${key}" use letters, digits and . _ : + - only (max 40 characters, 10 values).`)
      continue
    }
    pairs.push([key, values])
  }
  return { pairs, errors }
}

/**
 * Where the Prebid build comes from: an https URL, or a same-site path to a
 * file you host yourself. Credentials, odd ports and query strings are refused.
 */
export function parsePrebidUrl(value: unknown): { url: string; origin: string | null } | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 300) return null
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.includes('..')) return null
    return /^\/[A-Za-z0-9_\-./]{1,200}\.js$/.test(trimmed) ? { url: trimmed, origin: null } : null
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null
  if (!/^[a-z0-9.-]+$/.test(parsed.hostname) || !parsed.hostname.includes('.')) return null
  if (!/^\/[A-Za-z0-9_\-./@]{1,200}\.js$/.test(parsed.pathname)) return null
  return { url: `${parsed.origin}${parsed.pathname}`, origin: parsed.origin }
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export type AdUnitInput = {
  key?: unknown
  name?: unknown
  network?: unknown
  slotId?: unknown
  gamPath?: unknown
  sizesMobile?: unknown
  sizesTablet?: unknown
  sizesDesktop?: unknown
  floorPrice?: unknown
  refreshEnabled?: unknown
  refreshSeconds?: unknown
  refreshMax?: unknown
  targeting?: unknown
  prebid?: unknown
}

export const AD_NETWORKS = ['adsense', 'gam'] as const
export type AdNetwork = (typeof AD_NETWORKS)[number]

/** Returns a list of human-readable problems; empty means valid. */
export function validateAdUnit(input: AdUnitInput): string[] {
  const errors: string[] = []
  if (typeof input.name !== 'string' || !input.name.trim()) errors.push('Give the ad unit a name.')
  if (!isAdKey(input.key)) errors.push('Key must be lowercase letters, digits and dashes, starting with a letter or digit (max 40).')

  const network = input.network
  if (!(AD_NETWORKS as readonly unknown[]).includes(network)) errors.push('Choose a network.')

  const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())

  if (network === 'adsense') {
    if (blank(input.slotId)) errors.push('AdSense units need the ad slot id (the number in data-ad-slot).')
    else if (!isAdsenseSlot(input.slotId)) errors.push('AdSense slot id must be 6 to 20 digits.')
    if (input.refreshEnabled === true) errors.push('AdSense does not allow refreshing ads. Turn refresh off for this unit.')
    if (input.prebid === true) errors.push('Header bidding runs in front of Google Ad Manager, not AdSense. Use the Ad Manager network for this unit.')
  }
  if (network === 'gam' && !blank(input.gamPath) && !isGamPath(input.gamPath)) {
    errors.push('Ad unit path looks like /12345678/site/unit (network code, then letters, digits, . _ -).')
  }

  let anySize = false
  for (const [label, value] of [['mobile', input.sizesMobile], ['tablet', input.sizesTablet], ['desktop', input.sizesDesktop]] as const) {
    const parsed = parseSizes(value)
    if (parsed.error) errors.push(`Sizes (${label}): ${parsed.error}`)
    else if (parsed.sizes.length > 0) anySize = true
  }
  if (network === 'gam' && !anySize) errors.push('Ad Manager units need at least one size for some breakpoint, so space can be reserved.')

  if (!blank(input.floorPrice)) {
    const floor = Number(input.floorPrice)
    if (!Number.isFinite(floor) || floor < 0 || floor > MAX_FLOOR_PRICE) errors.push(`Floor price must be between 0 and ${MAX_FLOOR_PRICE}.`)
  }
  if (input.refreshEnabled === true && !blank(input.refreshSeconds)) {
    const s = Number(input.refreshSeconds)
    if (!Number.isFinite(s) || s < MIN_REFRESH_SECONDS || s > MAX_REFRESH_SECONDS) {
      errors.push(`Refresh interval must be ${MIN_REFRESH_SECONDS} to ${MAX_REFRESH_SECONDS} seconds.`)
    }
  }
  errors.push(...parseTargeting(input.targeting).errors)
  return errors
}

export type PlacementInput = {
  key?: unknown
  name?: unknown
  unit?: unknown
  mode?: unknown
  afterParagraph?: unknown
  repeatEvery?: unknown
  maxPerPage?: unknown
  feedEvery?: unknown
}

export const PLACEMENT_MODES = ['manual', 'after-paragraph', 'sidebar', 'in-feed', 'header', 'footer'] as const
export type PlacementMode = (typeof PLACEMENT_MODES)[number]

export function validatePlacement(input: PlacementInput): string[] {
  const errors: string[] = []
  if (typeof input.name !== 'string' || !input.name.trim()) errors.push('Give the placement a name.')
  if (!isAdKey(input.key)) errors.push('Key must be lowercase letters, digits and dashes, starting with a letter or digit (max 40).')
  if (input.unit === null || input.unit === undefined || input.unit === '') errors.push('Choose the ad unit this placement shows.')
  if (!(PLACEMENT_MODES as readonly unknown[]).includes(input.mode)) errors.push('Choose where the placement goes.')
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' ? Number.isInteger(v) && v >= min && v <= max : v === null || v === undefined || v === ''
  if (input.mode === 'after-paragraph') {
    if (typeof input.afterParagraph !== 'number' || !int(input.afterParagraph, 1, 50)) errors.push('Paragraph number must be a whole number from 1 to 50.')
    if (!int(input.repeatEvery, 0, 50)) errors.push('Repeat every must be a whole number from 0 to 50 (0 means once).')
  }
  if (input.mode === 'in-feed' && !(typeof input.feedEvery === 'number' && int(input.feedEvery, 2, 50))) {
    errors.push('In-feed placements need "every N items", a whole number from 2 to 50.')
  }
  if (!int(input.maxPerPage, 1, 10)) errors.push('Max per page must be a whole number from 1 to 10.')
  return errors
}
