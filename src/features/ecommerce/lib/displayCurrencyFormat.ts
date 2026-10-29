import { convertForDisplay, minorDigits } from './displayCurrency'

/**
 * Formats a whole-unit shop amount for display in an extra currency, with the "approx." label.
 * Used by the storefront hook only; the base-currency path stays on formatPriceInAUD.
 */
export function formatDisplayAmount(units: number | null | undefined, code: string, rate: number, digits = minorDigits(code), locale = 'en-AU'): string {
  const value = convertForDisplay(units, rate, digits)
  if (value === null) return '-'
  try {
    const text = new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    return `${text} approx.`
  } catch {
    return `${value.toFixed(digits)} ${code} approx.`
  }
}
