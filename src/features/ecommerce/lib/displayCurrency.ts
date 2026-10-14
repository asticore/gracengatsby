/**
 * Display-only currency conversion for the storefront. Pure: no database, no browser APIs, so the
 * server (layout, cron job, admin routes) and client components can both import it.
 *
 * Rates are "display units per one shop unit": a rate of 0.66 with an AUD shop shows 10 AUD as
 * 6.60 USD. Checkout NEVER uses these numbers; the order is always priced and charged in the base
 * shop currency on the server (see ../server/pricing.ts).
 */

/** The cookie that remembers the shopper's chosen display currency. Read by the layout, set by the switcher. */
export const DISPLAY_CURRENCY_COOKIE = 'eg_display_currency'

/** Upper limit on how many extra currencies the admin may list. */
export const MAX_DISPLAY_CURRENCIES = 12

/** Rates above this are refused: a typo like 6600 for 0.66 is caught before it reaches the storefront. */
export const MAX_RATE = 100000

export type RateMode = 'manual' | 'auto'

export type DisplayCurrencyOption = {
  code: string
  /** Display units per one shop unit. Always a positive number. */
  rate: number
  /** Decimal places this currency is shown with (JPY 0, most 2, KWD 3). */
  digits: number
}

/** Decimal places a currency is normally written with. Falls back to 2 when the runtime does not know the code. */
export function minorDigits(code: string): number {
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits
    return typeof digits === 'number' && digits >= 0 && digits <= 4 ? digits : 2
  } catch {
    return 2
  }
}

/** Three letters, upper-cased, or null. */
export function normaliseDisplayCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

/** A rate from user input or the API: a finite number above zero and below MAX_RATE, else null. */
export function parseRate(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > MAX_RATE) return null
  return n
}

/**
 * Converts a whole-unit shop amount (29.99 AUD) to the display currency, rounded to that
 * currency's own decimal places (half away from zero). `null` in, `null` out.
 */
export function convertForDisplay(units: number | null | undefined, rate: number, digits: number): number | null {
  if (typeof units !== 'number' || !Number.isFinite(units)) return null
  const factor = 10 ** digits
  const scaled = units * rate * factor
  // A tiny nudge makes 2.675-style float errors round the way a human expects.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9)
  return rounded / factor
}

/** The effective rate for a row: the manual rate, or the automatic one in auto mode. */
export function effectiveRate(row: { rate_mode?: unknown; manual_rate?: unknown; auto_rate?: unknown }): number | null {
  return parseRate(row.rate_mode === 'auto' ? row.auto_rate : row.manual_rate)
}

/** Whole days between two ISO times (for the daily refresh). Unparseable times count as very old. */
export function hoursSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY
  return (now.getTime() - at) / 3_600_000
}

/** Auto rates are refreshed once a day. */
export const AUTO_RATE_MAX_AGE_HOURS = 23

/** The cookie value the layout should honour: a listed code, or null for the shop currency. */
export function pickSelected(cookieValue: unknown, options: DisplayCurrencyOption[]): string | null {
  const code = normaliseDisplayCode(cookieValue)
  return code && options.some((o) => o.code === code) ? code : null
}

/** Credit line shown wherever automatic rates are used. The rate provider asks for it. */
export const RATE_ATTRIBUTION = 'Exchange rates by open.er-api.com'

/** What the storefront knows about display currencies, passed from the layout to the client. */
export type StorefrontCurrencyState = { base: string; selected: string | null; options: DisplayCurrencyOption[] }
