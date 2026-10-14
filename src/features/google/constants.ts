/**
 * Plain constants for the Google connection. No server imports and no secrets,
 * so both the server routes and the admin screen can read them.
 */

export const GOOGLE_CONNECTION_SLUG = 'google-connection'

/** The integrations global that receives the GA4 measurement ID and GTM container ID when they are blank. */
export const INTEGRATIONS_SLUG = 'integrations'

export const OAUTH_STATE_COOKIE = 'eg_google_oauth'

export const CALLBACK_PATH = '/api/google/callback'

export const ADMIN_PAGE_PATH = '/admin/google-connection'

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/** Every Google call gives up after this many milliseconds. */
export const GOOGLE_TIMEOUT_MS = 10_000

/** Scopes asked for at sign-in: read-only access to each service the dashboards show. */
export const GOOGLE_SCOPES: readonly string[] = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/adsense.readonly',
]

/** The redirect address the site owner pastes into the Google Cloud client. */
export function redirectUriFor(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${CALLBACK_PATH}`
}

export const PICKER_KINDS = ['ga4', 'gsc', 'gtm', 'adsense'] as const

export type PickerKind = (typeof PICKER_KINDS)[number]

export function isPickerKind(value: unknown): value is PickerKind {
  return typeof value === 'string' && (PICKER_KINDS as readonly string[]).includes(value)
}
