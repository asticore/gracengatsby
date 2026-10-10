import { CONSENT_CATEGORIES, isCookieCategory, type CookieCategory } from './consent'
import { CONSENT_MODES, type ConsentMode } from './regions'

/**
 * The consent settings as the page uses them, normalised from the raw
 * Integrations `consent` group.
 *
 * Every field is optional in the database, and on a fresh install there is no
 * row at all, so every read goes through here and gets a usable default.
 * Plain JSON on purpose: this object is passed from the server render into a
 * client component.
 */

export type ConsentPosition = 'bottom' | 'bottom-left' | 'bottom-right' | 'center'
export const CONSENT_POSITIONS: readonly ConsentPosition[] = ['bottom', 'bottom-left', 'bottom-right', 'center']

export type ConsentTheme = 'auto' | 'light' | 'dark'
export const CONSENT_THEMES: readonly ConsentTheme[] = ['auto', 'light', 'dark']

export type CookieListItem = {
  category: CookieCategory
  name: string
  provider: string
  purpose: string
  duration: string
}

export type ConsentConfig = {
  enabled: boolean
  mode: ConsentMode
  policyVersion: number
  bannerTitle: string
  bannerText: string
  acceptLabel: string
  rejectLabel: string
  customiseLabel: string
  saveLabel: string
  position: ConsentPosition
  theme: ConsentTheme
  bannerBackground: string | null
  bannerTextColor: string | null
  buttonColor: string | null
  privacyPolicyUrl: string | null
  cookieSettingsLabel: string
  cookieList: CookieListItem[]
  geoLogging: boolean
  logConsent: boolean
  consentModeV2: boolean
  headScriptCategory: CookieCategory
  bodyScriptCategory: CookieCategory
}

export const DEFAULT_CONSENT_TEXT = {
  bannerTitle: 'Cookies on this site',
  bannerText:
    'We use cookies to understand how this site is used. Analytics and marketing tags only load once you agree.',
  acceptLabel: 'Accept all',
  rejectLabel: 'Reject all',
  customiseLabel: 'Customise',
  saveLabel: 'Save choices',
  cookieSettingsLabel: 'Cookie settings',
} as const

const MAX_TEXT = 1000
const MAX_COOKIES = 200

const text = (value: unknown, fallback: string, max = 300): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : fallback
}

const optionalText = (value: unknown, max = 300): string | null => {
  const result = text(value, '', max)
  return result || null
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

/** Only a six-digit or three-digit hex colour, so the value is safe in a style attribute. */
export const cleanColour = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null
}

/** Relative paths and http(s) links only. Nothing that could run as script. */
export const cleanUrl = (value: unknown): string | null => {
  const url = optionalText(value, 500)
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null
}

const cookieList = (value: unknown): CookieListItem[] => {
  if (!Array.isArray(value)) return []
  const items: CookieListItem[] = []
  for (const entry of value.slice(0, MAX_COOKIES)) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const name = text(row.name, '', 200)
    if (!name) continue
    items.push({
      category: isCookieCategory(row.category) ? row.category : 'analytics',
      name,
      provider: text(row.provider, '', 200),
      purpose: text(row.purpose, '', MAX_TEXT),
      duration: text(row.duration, '', 100),
    })
  }
  return items
}

/**
 * Builds the page's consent settings.
 *
 * `integrations` is the Integrations global (or null on a fresh install).
 * `legacyAnalytics` is the SEO & Analytics group, whose `requireCookieConsent`
 * predates this feature: when `consent.mode` is not set, it still decides
 * whether tags wait for a choice. Off means notice only; on or unset means
 * opt-in everywhere.
 */
export function normaliseConsentConfig(integrations: unknown, legacyAnalytics: unknown): ConsentConfig {
  const doc = integrations && typeof integrations === 'object' ? (integrations as Record<string, unknown>) : {}
  const raw = doc.consent && typeof doc.consent === 'object' ? (doc.consent as Record<string, unknown>) : {}
  const legacy = legacyAnalytics && typeof legacyAnalytics === 'object' ? (legacyAnalytics as Record<string, unknown>) : {}

  const legacyMode: ConsentMode = legacy.requireCookieConsent === false ? 'notice-only' : 'opt-in-all'
  const mode = oneOf<ConsentMode>(raw.mode, CONSENT_MODES, legacyMode)

  const version = typeof raw.policyVersion === 'number' && Number.isInteger(raw.policyVersion) ? raw.policyVersion : 1

  return {
    enabled: raw.enabled !== false,
    mode,
    policyVersion: Math.min(Math.max(version, 1), 1_000_000),
    bannerTitle: text(raw.bannerTitle, DEFAULT_CONSENT_TEXT.bannerTitle, 200),
    bannerText: text(raw.bannerText, DEFAULT_CONSENT_TEXT.bannerText, MAX_TEXT),
    acceptLabel: text(raw.acceptLabel, DEFAULT_CONSENT_TEXT.acceptLabel, 60),
    rejectLabel: text(raw.rejectLabel, DEFAULT_CONSENT_TEXT.rejectLabel, 60),
    customiseLabel: text(raw.customiseLabel, DEFAULT_CONSENT_TEXT.customiseLabel, 60),
    saveLabel: text(raw.saveLabel, DEFAULT_CONSENT_TEXT.saveLabel, 60),
    position: oneOf(raw.position, CONSENT_POSITIONS, 'bottom'),
    theme: oneOf(raw.theme, CONSENT_THEMES, 'auto'),
    bannerBackground: cleanColour(raw.bannerBackground),
    bannerTextColor: cleanColour(raw.bannerTextColor),
    buttonColor: cleanColour(raw.buttonColor),
    privacyPolicyUrl: cleanUrl(raw.privacyPolicyUrl),
    cookieSettingsLabel: text(raw.cookieSettingsLabel, DEFAULT_CONSENT_TEXT.cookieSettingsLabel, 60),
    cookieList: cookieList(raw.cookieList),
    geoLogging: raw.geoLogging === true,
    logConsent: raw.logConsent !== false,
    consentModeV2: raw.consentModeV2 !== false,
    headScriptCategory: oneOf(raw.headScriptCategory, CONSENT_CATEGORIES, 'analytics'),
    bodyScriptCategory: oneOf(raw.bodyScriptCategory, CONSENT_CATEGORIES, 'analytics'),
  }
}

/** The category a custom script waits for. Consent switched off means nothing waits. */
export function scriptGate(config: ConsentConfig, which: 'head' | 'body'): CookieCategory {
  if (!config.enabled) return 'necessary'
  return which === 'head' ? config.headScriptCategory : config.bodyScriptCategory
}
