/**
 * The shop's one selling currency. It is set in Shop settings > General: the shop-settings global,
 * field `general.currency` (column `general_currency`). Pure apart from `loadShopCurrency`, which
 * reads the global through whatever engine it is given.
 */

export const DEFAULT_SHOP_CURRENCY = 'AUD'

/** Three letters, upper-cased. Anything else becomes the default currency. */
export function normaliseCurrency(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_SHOP_CURRENCY
  const code = value.trim()
  return /^[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : DEFAULT_SHOP_CURRENCY
}

/** The currency from a raw shop-settings document (groups are nested, so it is `general.currency`). */
export function currencyFromShopSettings(settings: unknown): string {
  const general = settings && typeof settings === 'object' ? (settings as { general?: unknown }).general : null
  const currency = general && typeof general === 'object' ? (general as { currency?: unknown }).currency : undefined
  return normaliseCurrency(currency)
}

/** Reads the shop currency. Falls back to the default when the global cannot be read. */
export async function loadShopCurrency(engine: { findGlobal: (args: unknown) => Promise<unknown> }): Promise<string> {
  try {
    return currencyFromShopSettings(await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }))
  } catch {
    return DEFAULT_SHOP_CURRENCY
  }
}
