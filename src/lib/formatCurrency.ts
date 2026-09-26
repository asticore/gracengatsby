/**
 * `paymentIntent.amount`-shaped values (Stripe's own PaymentIntent/Order
 * `amount`, e.g. `transactions.amount`/`orders.amount` - see
 * `stripeAdapter.ts`, both populated directly from a real Stripe API
 * response) are genuinely stored as integer cents. This turns them back into
 * a locale-formatted currency string.
 *
 * Do NOT use this for `priceInAUD` (or anything derived from it, like
 * `cart.subtotal`) - that field is stored in WHOLE currency units (e.g.
 * `29.99` meaning $29.99), a different, incompatible convention discovered
 * 2026-09-26 (see the plan doc's incident log and What's-left item #12).
 * Passing a `priceInAUD`-sourced value through this function divides it by
 * 100 a second time, displaying a price ~100x too small. Use
 * `formatPriceInAUD` below for those instead.
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

/**
 * Same output shape as `formatCurrency`, for a value ALREADY in whole
 * currency units - `priceInAUD` (and anything derived from it, like
 * `cart.subtotal`) - see that function's own doc comment for why these two
 * needed to be split (2026-09-26 unit-convention fix, plan doc What's-left
 * item #12).
 */
export function formatPriceInAUD(
  amount: number | null | undefined,
  currency = 'AUD',
  locale = 'en-AU',
): string {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return ''
  }

  return new Intl.NumberFormat(locale, {
    currency,
    style: 'currency',
  }).format(amount)
}
