import { resolveSpeed, type ResolvedSpeed, type SpeedSettingsInput } from './types'

/** The engine's auth cookie. Its presence is what "signed in" means here. */
export const AUTH_COOKIE = 'payload-token'

/** Never cached, whatever the settings say: admin, APIs, previews, auth flows. */
const NEVER_CACHE = [/^\/admin(\/|$)/, /^\/api(\/|$)/, /^\/next(\/|$)/, /^\/my-route(\/|$)/]

type HeaderBearing = { headers: { set: (name: string, value: string) => void } }

type ApplyOptions = {
  /** Path being served. Used only to keep admin/API responses out of any cache. */
  pathname?: string
  /**
   * Whether this request carries a session. Pass it explicitly when you already
   * know; otherwise pass `request` and it is read from the cookie header.
   */
  isLoggedIn?: boolean
  request?: { cookies?: { get: (name: string) => { value: string } | undefined }; headers?: { get: (name: string) => string | null } }
}

const detectLoggedIn = (opts: ApplyOptions): boolean => {
  if (typeof opts.isLoggedIn === 'boolean') return opts.isLoggedIn
  const fromCookies = opts.request?.cookies?.get?.(AUTH_COOKIE)?.value
  if (fromCookies) return true
  const header = opts.request?.headers?.get?.('cookie') || ''
  return header.split(';').some((part) => part.trim().startsWith(`${AUTH_COOKIE}=`))
}

const isCacheablePath = (pathname: string | undefined): boolean =>
  !pathname || !NEVER_CACHE.some((pattern) => pattern.test(pathname))

/**
 * Stamps cache-control on a response according to the Speed settings.
 *
 * `settings` may be either the raw global (it is resolved here) or an already
 * resolved object, so this can be called from a middleware that has a cached
 * copy of the settings as well as from a request that just read them.
 *
 * When caching is off - feature disabled, main switch off, a signed-in visitor
 * while "cache logged-in users" is off, or an admin/API path - the response is
 * marked explicitly private and no-store rather than simply left alone. Leaving
 * it alone risks an upstream proxy applying its own default.
 */
export function applySpeedHeaders<T extends HeaderBearing>(
  response: T,
  settings: SpeedSettingsInput | ResolvedSpeed,
  options: ApplyOptions = {},
): T {
  const resolved: ResolvedSpeed =
    settings && typeof settings === 'object' && 'enabled' in settings
      ? (settings as ResolvedSpeed)
      : resolveSpeed(settings as SpeedSettingsInput, true)

  const loggedIn = detectLoggedIn(options)
  const shouldCache =
    resolved.enabled &&
    resolved.caching.pageCache &&
    isCacheablePath(options.pathname) &&
    (!loggedIn || resolved.caching.cacheLoggedInUsers)

  if (!shouldCache) {
    if (resolved.enabled && resolved.caching.pageCache) {
      // Only speak up when caching was asked for and deliberately skipped -
      // otherwise this helper would start dictating headers for a feature the
      // site has not turned on.
      response.headers.set('Cache-Control', 'private, no-store')
      response.headers.set('x-speed-cache', loggedIn ? 'bypass-session' : 'bypass')
    }
    return response
  }

  const ttl = resolved.caching.ttlSeconds
  // stale-while-revalidate lets a purge-missed page still be replaced quickly
  // without a visitor ever waiting on a rebuild.
  const value = resolved.caching.cacheLoggedInUsers && loggedIn
    ? `private, max-age=${ttl}`
    : `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl, 60)}`

  response.headers.set('Cache-Control', value)
  response.headers.set('x-speed-cache', 'enabled')
  // Session state changes the response, so shared caches must key on it.
  response.headers.set('Vary', 'Cookie, Accept-Encoding')
  return response
}
