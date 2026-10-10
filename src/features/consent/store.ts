/**
 * Browser-side consent state: one record, shared by the banner, the gated
 * embeds and the tag loader.
 *
 * It is a small external store rather than React state so that components
 * which never render together (the banner, a YouTube placeholder three
 * sections down, the analytics loader) all see the same answer, and so a
 * choice made in one place updates the rest without any prop threading.
 *
 * Reads and writes are wrapped in try/catch: private windows, blocked storage
 * and cookie-less browsers all end up as "no choice made", which asks again.
 */

import {
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_COOKIE_NAME,
  CONSENT_EVENT,
  CONSENT_STORAGE_KEY,
  LEGACY_CONSENT_STORAGE_KEY,
  type ConsentChoices,
  type ConsentRecord,
  cookieSerialise,
  createRecord,
  migrateLegacyValue,
  newConsentId,
  parseRecord,
  readCookie,
  serialiseRecord,
} from './consent'

export type ConsentState = {
  /** False until the first read in the browser. Server and hydration use the placeholder. */
  loaded: boolean
  record: ConsentRecord | null
  /** The policy version this page is configured with. Null until configured. */
  policyVersion: number | null
  /** Whether a visitor with no answer starts with tags on (notice only) or off (opt-in). */
  defaultGranted: boolean
  /** Whether saved choices are sent to the anonymised consent log. */
  logConsent: boolean
}

/** Used only when a choice is saved before the banner has configured the page. */
export const DEFAULT_POLICY_VERSION = 1

export const SERVER_CONSENT_STATE: ConsentState = {
  loaded: false,
  record: null,
  policyVersion: null,
  defaultGranted: false,
  logConsent: false,
}

let state: ConsentState = SERVER_CONSENT_STATE
const listeners = new Set<() => void>()

const emit = (): void => {
  for (const listener of Array.from(listeners)) listener()
}

const writeStored = (record: ConsentRecord): void => {
  if (typeof document === 'undefined') return
  try {
    document.cookie = cookieSerialise(CONSENT_COOKIE_NAME, serialiseRecord(record), {
      maxAge: CONSENT_COOKIE_MAX_AGE,
      secure: window.location.protocol === 'https:',
    })
  } catch {
    // Cookies blocked: the mirror below still carries the choice for this browser.
  }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, serialiseRecord(record))
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY)
  } catch {
    // Storage blocked: the choice applies to this page view and is asked again later.
  }
}

const readStored = (): ConsentRecord | null => {
  if (typeof document === 'undefined') return null

  const fromCookie = parseRecord(readCookie(document.cookie, CONSENT_COOKIE_NAME))
  if (fromCookie) return fromCookie

  let fromMirror: ConsentRecord | null = null
  try {
    fromMirror = parseRecord(window.localStorage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    fromMirror = null
  }
  if (fromMirror) return fromMirror

  // The pre-categories value. Converted once here, and written back in the new
  // format so the old key can be dropped.
  let legacy: ConsentRecord | null = null
  try {
    legacy = migrateLegacyValue(window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY))
  } catch {
    legacy = null
  }
  if (legacy) writeStored(legacy)
  return legacy
}

/** Loads the stored record on first use. Idempotent after that. */
export function getConsentState(): ConsentState {
  if (!state.loaded && typeof window !== 'undefined') {
    state = { ...state, loaded: true, record: readStored() }
  }
  return state
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Called by the banner once the policy version and default are known for this visitor. */
export function configureConsent(config: { policyVersion: number; defaultGranted: boolean; logConsent: boolean }): void {
  const current = getConsentState()
  if (
    current.policyVersion === config.policyVersion &&
    current.defaultGranted === config.defaultGranted &&
    current.logConsent === config.logConsent
  ) {
    return
  }
  state = { ...current, ...config, policyVersion: config.policyVersion }
  emit()
}

/**
 * Saves a choice: cookie, mirror, the change event for anything that listens
 * on window, and (when logging is on) an anonymised entry on the server.
 */
export function saveConsent(choices: ConsentChoices, now = Date.now()): ConsentRecord {
  const current = getConsentState()
  const policyVersion = current.policyVersion ?? DEFAULT_POLICY_VERSION
  const record = createRecord(choices, policyVersion, now, newConsentId())

  writeStored(record)
  state = { ...current, record }
  emit()

  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }))
  } catch {
    // Very old browsers without the CustomEvent constructor: listeners on window
    // miss this one event. The store itself is already up to date.
  }

  if (current.logConsent) sendConsentLog(record)
  return record
}

/**
 * Posts the anonymised entry. keepalive lets it finish if the visitor navigates
 * away straight after choosing. A failure is ignored: the choice still applies.
 */
function sendConsentLog(record: ConsentRecord): void {
  if (typeof fetch !== 'function') return
  try {
    void fetch('/api/consent-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: record.id, v: record.v, c: record.c }),
      keepalive: true,
      credentials: 'omit',
    }).catch((): void => undefined)
  } catch {
    // Ignored on purpose: logging must never block the visitor's choice.
  }
}

/** Returns the store to its unread state. Exists for tests; nothing in the page calls it. */
export function resetConsentStoreForTests(): void {
  state = SERVER_CONSENT_STATE
  emit()
}
