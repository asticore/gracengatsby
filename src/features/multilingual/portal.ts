import { matchActive, preferredFromHeader } from './detect'
import { isLocaleRoutable } from './routing'
import type { MultilingualSettings } from './settings'

/**
 * Logged-in areas (the customer account, sign-in screens, enrolled lesson
 * pages). Their language is never a URL, never a per-page translation and never
 * written by the locale cookie from the path. It follows the visitor:
 *
 *   saved profile preference -> eg_locale cookie -> Accept-Language -> site default
 *
 * Everything here is pure and edge-safe (no db, no node built-ins): the
 * middleware imports `isPortalPath`, and the tests import the rest.
 */

export type PortalLocaleSource = 'profile' | 'cookie' | 'header' | 'default'

export type PortalLocaleDecision = { locale: string; source: PortalLocaleSource }

/** Top-level segment of the account area. Covers every /account/* screen, including sign-in and register. */
const ACCOUNT_ROOT = 'account'

/** Enrolled course content. `/courses/<slug>` (the catalogue entry) stays public; `/courses/<slug>/<lesson>` is member-only. */
const COURSES_ROOT = 'courses'

/**
 * True for any path that belongs to the logged-in portal, with or without a
 * locale prefix. A prefixed portal path (`/fr/account`) is still a portal path:
 * the middleware must leave it alone rather than strip the prefix and set the
 * cookie, so it is simply not found.
 */
export function isPortalPath(pathname: string, locales: readonly string[] = []): boolean {
  const parts = pathname.split('/').filter(Boolean)
  const head = parts[0]?.toLowerCase()
  const isPrefixed = head !== undefined && locales.some((code) => code.toLowerCase() === head)
  const segments = isPrefixed ? parts.slice(1) : parts
  const first = segments[0]?.toLowerCase()
  if (first === ACCOUNT_ROOT) return true
  if (first === COURSES_ROOT && segments.length >= 3) return true
  return false
}

/**
 * The portal language. Null when multilingual is off or has fewer than two
 * active locales, so the caller keeps the single-language markup.
 */
export function resolvePortalLocale(args: {
  settings: MultilingualSettings
  /** Saved on the customer's profile. Only honoured while it is still an active locale. */
  preferred?: string | null
  cookie?: string | null
  acceptLanguage?: string | null
}): PortalLocaleDecision | null {
  const { settings } = args
  if (!isLocaleRoutable(settings)) return null
  const active = settings.activeLocales

  const fromProfile = matchActive(args.preferred, active)
  if (fromProfile) return { locale: fromProfile, source: 'profile' }

  const fromCookie = matchActive(args.cookie, active)
  if (fromCookie) return { locale: fromCookie, source: 'cookie' }

  const fromHeader = preferredFromHeader(args.acceptLanguage, active)
  if (fromHeader) return { locale: fromHeader, source: 'header' }

  return { locale: settings.defaultLocale, source: 'default' }
}
