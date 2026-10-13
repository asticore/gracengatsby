/**
 * Back-in-stock sign-ups. Pure, no I/O: input checks, the dedupe key, the rule for when stock has
 * come back, and the test for showing the sign-up form. The database work lives in
 * ../backInStockSignup.ts (the public route) and ../backInStockNotify.ts (the product hook).
 */

import { computeStockStatus, type StockFields } from '../stock'
import type { VariationRow } from '../variations'
import { normalizeEmail } from './email'

export const BACK_IN_STOCK_HONEYPOT_FIELD = 'website'
/** Sign-ups a single client may send per minute (on top of the site-wide API limit). */
export const BACK_IN_STOCK_RATE_LIMIT_PER_MINUTE = 5
export const BACK_IN_STOCK_THANKS = 'Thanks. If this item is out of stock, we will email you when it is back.'

export type BackInStockInput = { productId?: unknown; variation?: unknown; email?: unknown; [BACK_IN_STOCK_HONEYPOT_FIELD]?: unknown }
export type CleanSignup = { productId: number; variation: string; email: string }

export type SignupCheck =
  | { ok: true; signup: CleanSignup }
  | { ok: false; spam: true }
  | { ok: false; spam: false; errors: Record<string, string> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** A filled honeypot means a bot: the caller answers as if it worked and stores nothing. */
export function checkSignup(input: BackInStockInput): SignupCheck {
  const trap = input[BACK_IN_STOCK_HONEYPOT_FIELD]
  if (typeof trap === 'string' && trap.trim() !== '') return { ok: false, spam: true }
  const errors: Record<string, string> = {}
  const productId = Number(input.productId)
  if (!Number.isInteger(productId) || productId < 1) errors.productId = 'Unknown product.'
  const variation = typeof input.variation === 'string' ? input.variation.trim().slice(0, 100) : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'Enter a valid email address.'
  if (Object.keys(errors).length > 0) return { ok: false, spam: false, errors }
  return { ok: true, signup: { productId, variation, email } }
}

/** One person, one product (and variation) - compared on the normalised address, so "+tags" and Gmail dots do not split it. */
export function signupKey(signup: { productId: number | string; variation?: string | null; email: string }): string {
  return `${signup.productId}|${signup.variation ?? ''}|${normalizeEmail(signup.email)}`
}

/** A variation with its own stock uses its own figures; otherwise the product's (as the storefront does). */
export function effectiveStock(variation: StockFields, product: StockFields): StockFields {
  return variation.manageStock ? variation : product.manageStock ? product : variation
}

/** True when this item was out of stock before the save and is in stock after it. */
export function shouldNotify(before: StockFields | null | undefined, after: StockFields | null | undefined): boolean {
  if (!before || !after) return false
  return computeStockStatus(before) === 'outofstock' && computeStockStatus(after) === 'instock'
}

type StockProduct = StockFields & { variations?: VariationRow[] | null }

/**
 * The variation ids (or [''] for a simple product) that came back into stock in this save. A variable
 * product with variations is judged variation by variation; its own status is not used.
 */
export function restockedVariations(before: StockProduct | null | undefined, after: StockProduct): string[] {
  if (!before) return []
  const variations = after.variations ?? []
  if (variations.length === 0) return shouldNotify(before, after) ? [''] : []
  const previous = new Map((before.variations ?? []).map((row) => [row.id, row]))
  const back: string[] = []
  for (const row of variations) {
    const old = row.id ? previous.get(row.id) : undefined
    if (!row.id || !old) continue
    if (shouldNotify(effectiveStock(old, before), effectiveStock(row, after))) back.push(row.id)
  }
  return back
}

/** The sign-up form is offered only on a simple product that is out of stock, while the Shop setting is on. */
export function showBackInStockForm(settings: unknown, product: StockProduct): boolean {
  const storefront = (settings as { storefront?: { backInStock?: boolean | null } } | null)?.storefront
  if (storefront?.backInStock === false) return false
  if ((product.variations ?? []).length > 0) return false
  return computeStockStatus(product) === 'outofstock'
}
