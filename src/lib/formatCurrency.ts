/**
 * Prices in the ecommerce plugin are stored as integer cents. This turns
 * them back into a locale-formatted currency string for server-rendered
 * markup (product cards, event ticket prices, etc).
 */
export function formatCurrency(
  cents: number | null | undefined,
  currency = 'AUD',
  locale = 'en-AU',
): string {
  if (typeof cents !== 'number' || Number.isNaN(cents)) {
    return ''
  }

  return new Intl.NumberFormat(locale, {
    currency,
    style: 'currency',
  }).format(cents / 100)
}
