/**
 * Validates the admin's list of extra display currencies before anything is saved. Pure.
 */
import { MAX_DISPLAY_CURRENCIES, normaliseDisplayCode, parseRate, type RateMode } from './displayCurrency'

export type DisplayCurrencyInput = {
  code: string
  enabled: boolean
  rateMode: RateMode
  /** Display units per one shop unit. Null in auto mode when the admin has not typed one. */
  manualRate: number | null
}

/** `error` is null when the list is fine. */
export type ValidatedDisplayCurrencies = { rows: DisplayCurrencyInput[]; error: string | null }

/** Checks the list from the admin screen. The position in the list becomes the order shoppers see. */
export function validateDisplayCurrencies(input: unknown, base: string): ValidatedDisplayCurrencies {
  const fail = (error: string): ValidatedDisplayCurrencies => ({ rows: [], error })
  if (!Array.isArray(input)) return fail('The list of currencies is missing.')
  if (input.length > MAX_DISPLAY_CURRENCIES) return fail(`You can list up to ${MAX_DISPLAY_CURRENCIES} display currencies.`)
  const seen = new Set<string>()
  const rows: DisplayCurrencyInput[] = []
  for (const item of input) {
    const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const code = normaliseDisplayCode(raw.code)
    if (!code) return fail('Currency codes are three letters, such as USD or EUR.')
    if (code === base) return fail(`${code} is already the shop currency, so it cannot also be a display currency.`)
    if (seen.has(code)) return fail(`${code} is listed more than once.`)
    seen.add(code)
    const rateMode: RateMode = raw.rateMode === 'auto' ? 'auto' : 'manual'
    const enabled = raw.enabled !== false
    const manualRate = raw.manualRate === null || raw.manualRate === undefined || raw.manualRate === '' ? null : parseRate(raw.manualRate)
    if (raw.manualRate !== null && raw.manualRate !== undefined && raw.manualRate !== '' && manualRate === null) {
      return fail(`The rate for ${code} must be a number greater than zero.`)
    }
    if (enabled && rateMode === 'manual' && manualRate === null) {
      return fail(`Type the exchange rate for ${code}, or switch it to automatic rates.`)
    }
    rows.push({ code, enabled, rateMode, manualRate })
  }
  return { rows, error: null }
}
