/**
 * Plain constants for the ad-platform connections (Meta, TikTok). No server
 * imports and no secrets, so the routes, the screen and the tests share them.
 * Google keeps its own constants in src/features/google/constants.ts.
 */

export const TRACKING_CONNECTIONS_SLUG = 'tracking-connections'

/** Admin path (relative to the admin root) of the connections screen. */
export const TRACKING_CONNECTIONS_PAGE = '/tracking-connections'

export const CONNECT_PROVIDERS = ['meta', 'tiktok'] as const

export type ConnectProvider = (typeof CONNECT_PROVIDERS)[number]

export const isConnectProvider = (value: unknown): value is ConnectProvider =>
  typeof value === 'string' && (CONNECT_PROVIDERS as readonly string[]).includes(value)

/** The HttpOnly cookie that carries the signed OAuth state for one provider. Path-scoped to its own routes. */
export const stateCookieName = (provider: ConnectProvider): string => `eg_tracking_oauth_${provider}`

/** The Graph API version used for every Meta call. Bump together with the live check. */
export const META_GRAPH_VERSION = 'v21.0'

/** Meta scopes: list the owner's ad accounts and the pixels on them. Reading only; nothing is created or changed. */
export const META_SCOPES: readonly string[] = ['business_management', 'ads_read']

export const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth'

export const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3'

/** Every provider call gives up after this many milliseconds. */
export const CONNECT_TIMEOUT_MS = 10_000

/** Upper bounds so one connection cannot fan out into unbounded API calls. */
export const MAX_AD_ACCOUNTS = 25
export const MAX_PIXEL_OPTIONS = 200

/**
 * The redirect address the owner registers in each developer console. It is the
 * site origin (SITE_URL when set, otherwise the host the admin is using) plus the
 * provider's callback path. One address per domain you connect from.
 */
export function connectRedirectUri(origin: string, provider: ConnectProvider): string {
  return `${origin.replace(/\/+$/, '')}/api/tracking-connect/${provider}/callback`
}
