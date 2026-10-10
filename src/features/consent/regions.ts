/**
 * Which visitors must opt in before non-essential cookies are set.
 *
 * The country comes from Cloudflare's `cf-ipcountry` header, read in the root
 * layout and passed down. It is a country code only: no address is kept, and
 * it is used for this one decision and, if the operator turns on geo logging,
 * for the anonymised consent log.
 */

export const CONSENT_MODES = ['opt-in-all', 'opt-in-regional', 'notice-only'] as const
export type ConsentMode = (typeof CONSENT_MODES)[number]

/**
 * EU member states, the EEA extras (Iceland, Liechtenstein, Norway), the UK and
 * Switzerland. The set that the ePrivacy rules and their UK and Swiss
 * equivalents apply to.
 */
export const OPT_IN_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB',
  'CH',
])

/** Cloudflare sends XX for an unknown address and T1 for Tor. Both count as unknown. */
const UNKNOWN_COUNTRY_CODES: ReadonlySet<string> = new Set(['XX', 'T1'])

/** Upper-cased two-letter code, or null when the header is absent or not a country. */
export function normaliseCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code) || UNKNOWN_COUNTRY_CODES.has(code)) return null
  return code
}

export const isOptInCountry = (country: string | null | undefined): boolean => {
  const code = normaliseCountry(country)
  return code !== null && OPT_IN_COUNTRIES.has(code)
}

/**
 * True when the visitor must actively choose before optional cookies are set.
 *
 * An unknown country is treated as opt-in in the regional mode. Guessing
 * "outside the EU" for someone whose location we cannot see is the less safe
 * error.
 */
export function requireOptIn(country: string | null | undefined, mode: ConsentMode): boolean {
  switch (mode) {
    case 'opt-in-all':
      return true
    case 'notice-only':
      return false
    case 'opt-in-regional':
      return normaliseCountry(country) === null || isOptInCountry(country)
    default:
      return true
  }
}
