/**
 * The consent record: what one visitor chose, under which policy version.
 *
 * Pure on purpose. Nothing here touches the DOM, the request or the database,
 * so the same functions run in the browser (store.ts), in the server render
 * (SeoScripts reads the cookie) and in tests.
 *
 * The record lives in two places the visitor's browser keeps: the first-party
 * cookie `engage_consent` (what the server can read) and a localStorage mirror
 * (what survives a cookie being blocked). The cookie is the source of truth
 * when both exist.
 */

export const CONSENT_CATEGORIES = ['necessary', 'preferences', 'analytics', 'marketing'] as const

export type CookieCategory = (typeof CONSENT_CATEGORIES)[number]

/** Every category, with necessary always true. */
export type ConsentChoices = Record<CookieCategory, boolean>

export type ConsentRecord = {
  /** Policy version the visitor answered. A different number asks again. */
  v: number
  /** Random, per decision. Lets the anonymised log tell repeat decisions apart. */
  id: string
  c: ConsentChoices
  /** Epoch milliseconds of the decision. */
  t: number
}

export const CONSENT_COOKIE_NAME = 'engage_consent'
/** localStorage mirror of the record. */
export const CONSENT_STORAGE_KEY = 'engage-consent'
/** The pre-categories key, holding 'granted' or 'denied'. Read once, then cleared. */
export const LEGACY_CONSENT_STORAGE_KEY = 'engage-cookie-consent'
/** Dispatched on `window` with `detail: ConsentRecord` whenever a choice is saved. */
export const CONSENT_EVENT = 'engage:cookie-consent'
/** Twelve months, the longest a cookie-based choice is usually kept. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const CATEGORY_COPY: Record<CookieCategory, { label: string; description: string }> = {
  necessary: { label: 'Necessary', description: 'Needed for the site to work. Always on.' },
  preferences: { label: 'Preferences', description: 'Remember choices such as language or display settings.' },
  analytics: { label: 'Analytics', description: 'Help us understand how the site is used.' },
  marketing: { label: 'Marketing', description: 'Used to show relevant adverts and measure campaigns.' },
}

const CONSENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export const isCookieCategory = (value: unknown): value is CookieCategory =>
  typeof value === 'string' && (CONSENT_CATEGORIES as readonly string[]).includes(value)

/** Necessary is always on; the rest take the value given (default off). */
export function makeChoices(partial: Partial<Record<CookieCategory, boolean>> = {}): ConsentChoices {
  return {
    necessary: true,
    preferences: partial.preferences === true,
    analytics: partial.analytics === true,
    marketing: partial.marketing === true,
  }
}

/** Everything granted or everything refused (necessary stays on either way). */
export const allChoices = (granted: boolean): ConsentChoices => makeChoices({ preferences: granted, analytics: granted, marketing: granted })

export function newConsentId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  // Fallback for runtimes without randomUUID: 16 random bytes in hex.
  const bytes = new Uint8Array(16)
  cryptoApi?.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function createRecord(choices: Partial<Record<CookieCategory, boolean>>, policyVersion: number, now = Date.now(), id = newConsentId()): ConsentRecord {
  return { v: policyVersion, id, c: makeChoices(choices), t: now }
}

/**
 * Reads a stored record. Accepts the JSON text or an already-parsed object.
 * Anything malformed is treated as "no choice made" rather than an error: a
 * tampered or truncated cookie should ask again, not break the page.
 */
export function parseRecord(raw: unknown): ConsentRecord | null {
  let value: unknown = raw
  if (typeof raw === 'string') {
    if (!raw) return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>

  const v = data.v
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) return null

  const id = data.id
  if (typeof id !== 'string' || !CONSENT_ID_PATTERN.test(id)) return null

  const t = data.t
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return null

  const c = data.c
  if (!c || typeof c !== 'object') return null
  const choices = c as Record<string, unknown>
  if (['preferences', 'analytics', 'marketing'].some((key) => typeof choices[key] !== 'boolean')) return null

  return {
    v,
    id,
    c: makeChoices({
      preferences: choices.preferences === true,
      analytics: choices.analytics === true,
      marketing: choices.marketing === true,
    }),
    t,
  }
}

/** Compact JSON for the cookie and the mirror. Key names are short on purpose. */
export function serialiseRecord(record: ConsentRecord): string {
  return JSON.stringify({ v: record.v, id: record.id, c: makeChoices(record.c), t: record.t })
}

/**
 * Turns the value written by the pre-categories banner into a record.
 *
 * 'granted' meant "tracking is fine", so analytics is turned on. Marketing is
 * left off: the old banner did not separate the two, and whether a Meta pixel
 * is configured is not known here, so the safer reading is taken and the
 * visitor can opt in. 'denied' becomes everything off. The legacy choice was
 * made under no policy version, so it is recorded as version 1 and is asked
 * again only when the policy version moves past that.
 */
export function migrateLegacyValue(value: unknown, id: string = newConsentId(), now = Date.now()): ConsentRecord | null {
  if (value === 'granted') return { v: 1, id, c: makeChoices({ analytics: true, marketing: false }), t: now }
  if (value === 'denied') return { v: 1, id, c: makeChoices({}), t: now }
  return null
}

/** True when the visitor answered this policy version (not an older one). */
export function isCurrentRecord(record: ConsentRecord | null | undefined, policyVersion: number): boolean {
  return !!record && record.v === policyVersion
}

/**
 * What applies right now. With no current answer, the default is the visitor's
 * situation: refused for opt-in visitors, granted for notice-only ones (where
 * tags load straight away and the banner is informational).
 */
export function effectiveChoices(record: ConsentRecord | null | undefined, policyVersion: number, defaultGranted: boolean): ConsentChoices {
  if (record && isCurrentRecord(record, policyVersion)) return makeChoices(record.c)
  return allChoices(defaultGranted)
}

/** Keeps a re-saved choice from changing the set a category is measured against. */
export function withCategory(choices: ConsentChoices, category: CookieCategory, granted: boolean): ConsentChoices {
  return makeChoices({ ...choices, [category]: category === 'necessary' ? true : granted })
}

export function cookieSerialise(name: string, value: string, options: { maxAge: number; secure: boolean }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${options.maxAge}`, 'SameSite=Lax']
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

/** Reads one cookie out of a Cookie header or document.cookie string. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    const raw = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }
  return null
}
