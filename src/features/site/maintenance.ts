/**
 * Maintenance mode rules. Pure: no engine, no request objects, so the spec can test every branch.
 * The one hook at the bottom (maintenanceTokenBeforeChange) needs only the platform's random source.
 */

export const BYPASS_COOKIE = 'maint_bypass'
/** Seven days, in seconds. */
export const BYPASS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const BYPASS_PATH_PREFIX = '/maintenance-bypass/'

const TOKEN_PATTERN = /^[a-f0-9]{24}$/

/** Paths that are never behind the maintenance screen: admin, API (webhooks included), feeds and files. */
const EXCLUDED_PREFIXES = ['/admin', '/api', '/feeds', '/maintenance-bypass', '/visual-editor-canvas']
const EXCLUDED_FILES = ['/robots.txt', '/sitemap.xml', '/indexnow-key.txt', '/ads.txt', '/app-ads.txt', '/llms.txt', '/llms-full.txt', '/humans.txt']

export const isValidBypassToken = (value: unknown): value is string => typeof value === 'string' && TOKEN_PATTERN.test(value)

/** The path a visitor opens to be let through (the route in src/app/maintenance-bypass). */
export const bypassLinkPath = (token: string): string => `${BYPASS_PATH_PREFIX}${token}`

/** True for the bypass link itself, so the link never gets caught by the screen it opens. */
export const isBypassPath = (path: string): boolean => path.startsWith(BYPASS_PATH_PREFIX)

const onPrefix = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`)

/** True for paths the maintenance screen never covers. Compares the path only, not the query string. */
export const isExcludedPath = (path: string): boolean => {
  const clean = (path || '/').split('?')[0].split('#')[0] || '/'
  if (EXCLUDED_PREFIXES.some((prefix) => onPrefix(clean, prefix))) return true
  return EXCLUDED_FILES.includes(clean)
}

export type MaintenanceInput = {
  enabled: boolean
  path: string
  /** The value of the maint_bypass cookie, if the visitor has one. */
  cookie: string | null | undefined
  /** The stored bypass token. */
  token: string | null | undefined
  isAdmin: boolean
  allowAdmins: boolean
}

/** A visitor is let through by the cookie that matches the current token, or by being a signed-in admin when allowed. */
export const isBypassed = (input: Pick<MaintenanceInput, 'cookie' | 'token' | 'isAdmin' | 'allowAdmins'>): boolean => {
  if (input.allowAdmins && input.isAdmin) return true
  return isValidBypassToken(input.token) && input.cookie === input.token
}

/** Whether this request gets the maintenance screen instead of the page. */
export const shouldShowMaintenance = (input: MaintenanceInput): boolean => {
  if (!input.enabled) return false
  if (isExcludedPath(input.path) || isBypassPath(input.path)) return false
  return !isBypassed(input)
}

type MaintenanceGroup = { enabled?: boolean | null; bypassToken?: string | null }
type MaintenanceTokenData = { maintenance?: MaintenanceGroup | null }

const newBypassToken = (): string => {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * beforeChange on the site-pages global. The token is never taken from the request: a valid stored
 * token is kept so the shared link keeps working, and a new one is made only when maintenance is
 * switched on and no token exists yet. Otherwise the token is cleared.
 */
export const maintenanceTokenBeforeChange = ({
  data,
  originalDoc,
}: {
  data?: MaintenanceTokenData
  originalDoc?: MaintenanceTokenData | null
}): MaintenanceTokenData | undefined => {
  const group = data?.maintenance
  if (!data || !group || typeof group !== 'object') return data

  const existing = originalDoc?.maintenance?.bypassToken
  if (isValidBypassToken(existing)) {
    group.bypassToken = existing
  } else if (group.enabled) {
    group.bypassToken = newBypassToken()
  } else {
    group.bypassToken = null
  }
  return data
}
