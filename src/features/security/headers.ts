import { DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from './settings'

/**
 * Turns the Headers section of the Security screen into the actual response
 * headers.
 *
 * Pure and synchronous so the middleware can call it on every response without
 * thinking about it, and so it can be unit-tested without a database.
 */

export type HeaderMap = Record<string, string>

/** Two years, the value browsers require before honouring a preload request. */
const HSTS_VALUE = 'max-age=63072000; includeSubDomains'

/**
 * The admin portal and the visual editor are the reason this policy is not
 * tighter.
 *
 * Both render inline `<style>` and inline `<script>` - the theme variables in
 * the site layout, the per-block design CSS, and the framework's own hydration
 * bootstrap - and the editor evaluates block schemas at runtime. A policy
 * without 'unsafe-inline' on styles and 'unsafe-inline' 'unsafe-eval' on
 * scripts turns the editor into a blank screen with errors only in the
 * console.
 *
 * So the honest tradeoff, stated plainly: this default stops mixed-content and
 * plugin/iframe injection and constrains where scripts may be LOADED from, but
 * it does NOT stop reflected or stored cross-site scripting, because
 * 'unsafe-inline' is exactly the thing that would. Tightening it means moving
 * to per-request nonces, which the engine's admin bundle does not currently
 * emit. Until then the defence against injected script is output encoding, not
 * this header.
 *
 * `frame-ancestors` is deliberately absent: X-Frame-Options already carries
 * that, from a setting the user controls, and having both disagree is worse
 * than having one.
 */
export const DEFAULT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

/**
 * Routes where no default policy is applied at all.
 *
 * The portal is the one place where a silently broken page costs the most and
 * where the user cannot route around it, so a policy nobody asked for is not
 * imposed there. An explicit policy typed into the settings screen still
 * applies everywhere - if somebody has taken the trouble to write one, they
 * mean it.
 */
const POLICY_FREE_PREFIXES = ['/admin', '/api/graphql-playground']

export const isPolicyFreePath = (pathname: string): boolean =>
  POLICY_FREE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * Builds the header set for one response.
 *
 * `pathname` only affects Content-Security-Policy, and only when the setting is
 * blank; every other header is path-independent.
 */
export function securityHeaders(
  settings: SecuritySettings = DEFAULT_SECURITY_SETTINGS,
  pathname = '/',
): HeaderMap {
  const headers: HeaderMap = {}

  if (!settings.featureEnabled) return headers

  const config = settings.headers

  if (config.hsts) {
    headers['Strict-Transport-Security'] = HSTS_VALUE
  }

  headers['X-Frame-Options'] = config.xFrameOptions

  if (config.xContentTypeOptions) {
    headers['X-Content-Type-Options'] = 'nosniff'
  }

  if (config.referrerPolicy) {
    headers['Referrer-Policy'] = config.referrerPolicy
  }

  if (config.permissionsPolicy) {
    headers['Permissions-Policy'] = normalisePermissionsPolicy(config.permissionsPolicy)
  }

  const csp = config.contentSecurityPolicy
    ? config.contentSecurityPolicy.replace(/\s+/g, ' ').trim()
    : isPolicyFreePath(pathname)
      ? ''
      : DEFAULT_CONTENT_SECURITY_POLICY

  if (csp) {
    headers['Content-Security-Policy'] = csp
  }

  return headers
}

/**
 * The settings field is a textarea, so the value arrives with whatever line
 * breaks the user typed. Header values cannot contain them - a raw newline
 * would either be rejected or, worse, split the header - so they collapse to
 * the comma the policy grammar uses between directives.
 */
function normalisePermissionsPolicy(value: string): string {
  return value
    .split(/[\r\n]+/)
    .map((line) => line.trim().replace(/,$/, ''))
    .filter(Boolean)
    .join(', ')
}

/**
 * Headers that name the software behind the site. Removing them is cosmetic -
 * the markup gives the same answer to anyone who looks - but it is what the
 * fingerprint toggle promises, so it does exactly that and no more.
 */
export const FINGERPRINT_HEADERS = ['x-powered-by', 'server', 'x-generator']
