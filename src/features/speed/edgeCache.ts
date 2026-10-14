/**
 * Pure rules for the Worker's edge page cache (wave 17).
 *
 * Nothing in this file touches the network, the database or the Workers
 * runtime, so every decision the cache makes can be unit tested directly. The
 * runtime wrapper that talks to D1 and caches.default lives in
 * edgeCacheWorker.ts. Keep this file free of '@/' imports: the Worker entry
 * bundles it on its own.
 */

/** Cookie the engine sets for signed-in admins and editors. Its presence always means "never cache". */
export const SESSION_COOKIE = 'engage-token'

/** Password-unlock cookies (content-unlock). Any cookie with this prefix means "never cache". */
export const UNLOCK_COOKIE_PREFIX = 'eg_unlock_'

/**
 * Cookies that do not change what the HTML says, so a visitor carrying only
 * these can still be served a shared copy. The consent cookie name matches
 * CONSENT_COOKIE_NAME in src/features/consent/consent.ts (copied here so the
 * Worker bundle does not pull in browser code).
 */
export const HARMLESS_COOKIES: readonly string[] = ['engage_consent']

/** Query parameters that are removed before the cache key is built. Everything else makes a URL uncacheable. */
export const STRIPPED_QUERY_PARAMS: readonly string[] = ['fbclid', 'gclid']

/** Path segments that are never cached, matched on whole segments ("/admin" and "/admin/x", not "/administrator"). */
export const NEVER_CACHE_SEGMENTS: readonly string[] = [
  '/admin',
  '/api',
  '/_next',
  '/cart',
  '/checkout',
  '/account',
  '/login',
  '/maintenance-bypass',
]

export const DEFAULT_TTL_SECONDS = 600
export const MIN_TTL_SECONDS = 30
export const MAX_TTL_SECONDS = 604800

const RULE_LINE_MAX_LENGTH = 200
const RULE_LINE_MAX_COUNT = 200

const MOBILE_UA = /Mobi|Android|iPhone|iPod|iPad|Opera Mini|IEMobile|BlackBerry|Windows Phone/i

export type HeadersLike = { get(name: string): string | null }

/** The never-cache settings the request decision needs. */
export type EdgeRules = {
  cacheLoggedInUsers: boolean
  neverCachePaths: string[]
  neverCacheCookies: string[]
  neverCacheQueryStrings: string[]
}

export type RequestVerdict = { cacheable: boolean; reason: string }

/**
 * Splits a textarea into rules: one per line, trimmed, blank lines and lines
 * starting with '#' dropped, duplicates removed, each line clipped and the
 * list capped so a pasted novel cannot make every request slow.
 */
export function parseRuleLines(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const clipped = line.slice(0, RULE_LINE_MAX_LENGTH)
    if (!out.includes(clipped)) out.push(clipped)
    if (out.length >= RULE_LINE_MAX_COUNT) break
  }
  return out
}

/**
 * Matches a name (cookie, query parameter) against one rule. A trailing '*'
 * makes it a plain prefix match; otherwise the names must be equal.
 */
export function matchesRule(name: string, rule: string): boolean {
  const pattern = rule.trim()
  if (!pattern) return false
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1))
  return name === pattern
}

/** Leading slash on, trailing slash off (except the root). */
function normalisePath(path: string): string {
  let out = path.startsWith('/') ? path : `/${path}`
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

/**
 * Path rules: "/shop/basket" is an exact path, "/shop/*" is everything whose
 * path starts with "/shop/". A missing leading slash is added.
 */
export function matchesNeverCache(path: string, patterns: readonly string[]): boolean {
  const current = normalisePath(path)
  return patterns.some((raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return false
    if (trimmed.endsWith('*')) {
      const prefix = normalisePath(trimmed.slice(0, -1) || '/')
      return current.startsWith(prefix)
    }
    return current === normalisePath(trimmed)
  })
}

/** True when the path is one of the segment prefixes in NEVER_CACHE_SEGMENTS (or below one). */
export function isNeverCacheSegment(path: string): boolean {
  const current = normalisePath(path)
  return NEVER_CACHE_SEGMENTS.some((segment) => current === segment || current.startsWith(`${segment}/`))
}

/** Cookie names from a Cookie header, in order. Values are never inspected. */
export function parseCookieNames(header: string | null | undefined): string[] {
  if (!header) return []
  const names: string[] = []
  for (const part of header.split(';')) {
    const name = part.split('=')[0]?.trim() ?? ''
    if (name) names.push(name)
  }
  return names
}

/** utm_* plus the click ids in STRIPPED_QUERY_PARAMS. */
export function isStrippedQueryParam(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || STRIPPED_QUERY_PARAMS.includes(lower)
}

/** The full decision, with the reason a debug header can show. Order matters: the first failing check wins. */
export function requestVerdict(url: string, method: string, headers: HeadersLike, rules: EdgeRules): RequestVerdict {
  const verdict = (cacheable: boolean, reason: string): RequestVerdict => ({ cacheable, reason })

  if (method !== 'GET' && method !== 'HEAD') return verdict(false, 'method')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return verdict(false, 'url')
  }

  if (headers.get('authorization')) return verdict(false, 'auth')
  if (headers.get('range')) return verdict(false, 'range')
  if (isNeverCacheSegment(parsed.pathname)) return verdict(false, 'path')
  if (matchesNeverCache(parsed.pathname, rules.neverCachePaths)) return verdict(false, 'never-path')

  const queryNames = Array.from(new Set(Array.from(parsed.searchParams.keys())))
  for (const name of queryNames) {
    if (rules.neverCacheQueryStrings.some((rule) => matchesRule(name.toLowerCase(), rule.toLowerCase()))) {
      return verdict(false, 'never-query')
    }
  }
  if (queryNames.some((name) => !isStrippedQueryParam(name))) return verdict(false, 'query')

  const cookies = parseCookieNames(headers.get('cookie'))
  if (cookies.includes(SESSION_COOKIE)) return verdict(false, 'signed-in')
  if (cookies.some((name) => name.startsWith(UNLOCK_COOKIE_PREFIX))) return verdict(false, 'unlock')
  if (cookies.some((name) => rules.neverCacheCookies.some((rule) => matchesRule(name, rule)))) {
    return verdict(false, 'never-cookie')
  }
  if (!rules.cacheLoggedInUsers && cookies.some((name) => !HARMLESS_COOKIES.includes(name))) {
    return verdict(false, 'cookie')
  }

  return verdict(true, 'ok')
}

export function isCacheableRequest(url: string, headers: HeadersLike, method: string, rules: EdgeRules): boolean {
  return requestVerdict(url, method, headers, rules).cacheable
}

/**
 * The cache key: scheme, host and path, plus `v=<epoch>` so a bump makes every
 * stored copy unreachable at once, plus `m=1` for mobile visitors when mobile
 * copies are kept apart. Query strings never reach this point (only stripped
 * parameters get this far, and those are dropped).
 */
export function cacheKeyFor(url: string, epoch: number, mobile: boolean): string {
  const parsed = new URL(url)
  const version = Number.isFinite(epoch) && epoch > 0 ? Math.floor(epoch) : 1
  const key = new URL(`${parsed.origin}${parsed.pathname}`)
  key.searchParams.set('v', String(version))
  if (mobile) key.searchParams.set('m', '1')
  return key.toString()
}

export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && MOBILE_UA.test(userAgent as string)
}

/** Only a plain 200 HTML page is worth keeping: no cookies set, nothing marked private or no-store. */
export function isCacheableResponse(status: number, headers: HeadersLike): boolean {
  if (status !== 200) return false
  const type = headers.get('content-type') || ''
  if (!/^\s*text\/html/i.test(type)) return false
  if (headers.get('set-cookie')) return false
  const control = (headers.get('cache-control') || '').toLowerCase()
  if (control.includes('no-store') || control.includes('private')) return false
  return true
}

/** Turns the stored TTL into a usable number of seconds. Missing or non-numeric values fall back to the default. */
export function clampTtl(value: number | null | undefined): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TTL_SECONDS
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.round(raw)))
}
