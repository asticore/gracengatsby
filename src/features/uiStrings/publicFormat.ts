/**
 * Locale-aware date and price formatting for the storefront. With no locale (multilingual off)
 * each helper makes the same call the page always made, so English output does not change.
 * Edge-safe: no node or db imports.
 */

const SHOP_PRICE_LOCALE = 'en-AU'

/** The Intl locale for shop prices: the visitor's language, or the shop's English default. */
export function priceLocale(locale: string | null | undefined): string {
  return locale ? locale : SHOP_PRICE_LOCALE
}

/** A date in the visitor's language. With `options` and no locale it keeps the en-AU long form the page used. */
export function formatDateFor(value: string | Date, locale: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value)
  if (locale) return date.toLocaleDateString(locale, options)
  return options ? date.toLocaleDateString('en-AU', options) : date.toLocaleDateString()
}
