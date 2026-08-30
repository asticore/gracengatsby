import type { FormDoc, FormFieldDef, FormPricing, LineItem, SubmissionValues } from './types'

import { roundTo, toNumber } from './expression'

/**
 * Turning a filled-in form into money.
 *
 * Prices are always computed here, on the server, from the stored form and the
 * sanitised values - never read from the request. The browser runs the same
 * function to show a running total, but its answer is a preview and is
 * discarded on submit.
 *
 * Amounts are in whole currency units to match the shop plugin's own price
 * fields (`priceInAUD` and friends), not cents. The one place that has to think
 * in cents is Stripe, and the shop plugin already does that conversion for
 * everything else it sells.
 */

/** Price attached to the chosen option(s) of a select/radio/checkbox field. */
const optionPrice = (field: FormFieldDef, value: unknown): number => {
  const options = field.options || []
  if (options.length === 0) return 0

  const chosen = (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry ?? '').trim().toLowerCase())
    .filter(Boolean)

  let sum = 0
  for (const option of options) {
    const key = String(option?.value ?? '').trim().toLowerCase()
    if (key && chosen.includes(key)) sum += toNumber(option?.price)
  }
  return sum
}

const hasValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return value
  return String(value).trim() !== ''
}

/**
 * The priced lines for one submission.
 *
 * Three sources add up, in this order: the form's base price, then per-field
 * pricing (a flat amount when the field is filled in, plus a unit price times
 * the field's own number), then the price on each chosen option. A calculation
 * field named in `payment.totalField` overrides the lot - which is how an author
 * expresses a price that is not a simple sum, without this module needing to
 * understand it.
 */
export function priceSubmission(
  form: FormDoc,
  values: SubmissionValues,
  visible?: Set<string>,
): FormPricing {
  const currency = form?.payment?.currency || 'AUD'
  const lines: LineItem[] = []

  if (!form?.payment?.purchasable) return { currency, lines, total: 0 }

  const isShown = (field: FormFieldDef): boolean => !visible || !field.name || visible.has(field.name)

  const override = form.payment.totalField
  if (override) {
    const total = roundTo(toNumber(values[override]), 2)
    return {
      currency,
      lines: [{ label: form.title || 'Form', amount: total, quantity: 1, source: override }],
      total,
    }
  }

  const base = toNumber(form.payment.basePrice)
  if (base !== 0) {
    lines.push({ label: form.title || 'Form', amount: roundTo(base, 2), quantity: 1 })
  }

  for (const field of form.fields || []) {
    if (!field?.name || !isShown(field)) continue

    const value = values[field.name]
    const label = field.label || field.name

    const options = optionPrice(field, value)
    if (options !== 0) {
      lines.push({ label, amount: roundTo(options, 2), quantity: 1, source: field.name })
    }

    if (!field.pricing?.priced) continue

    const flat = toNumber(field.pricing.amount)
    if (flat !== 0 && hasValue(value)) {
      lines.push({ label, amount: roundTo(flat, 2), quantity: 1, source: field.name })
    }

    const unit = toNumber(field.pricing.unitPrice)
    if (unit !== 0) {
      const quantity = toNumber(value)
      if (quantity !== 0) {
        lines.push({ label, amount: roundTo(unit, 2), quantity, source: field.name })
      }
    }
  }

  const total = roundTo(
    lines.reduce((sum, line) => sum + line.amount * line.quantity, 0),
    2,
  )

  return { currency, lines, total }
}

/**
 * What checkout is handed when a purchasable form is submitted.
 *
 * INTEGRATION STATUS - read before wiring this to Stripe.
 *
 * This is the handoff point and it stops here on purpose. The shop plugin's
 * cart stores items as a relationship to a product row: `addItem({ product })`
 * in AddToCartButton, and the order and transaction tables carry the same
 * reference. A form submission has no product row, so there is no honest way to
 * put one in the cart without either inventing a product per submission or
 * changing the plugin's cart schema - both of which are decisions about the
 * shop, not about forms, and neither is mine to make from inside this feature.
 *
 * So: the pricing above is real and complete, and this returns a fully-formed
 * handoff the checkout can consume. What is NOT built is the last hop - taking
 * this object and creating a cart item, payment intent and order.
 *
 * The two ways to finish it, in order of preference:
 *
 *   1. Give each purchasable form a hidden product row (`payment.product`,
 *      already on the form) whose price is ignored, and add the submission's
 *      total as a cart-item price override. Needs one column on the cart items
 *      table via `cartsCollectionOverride` in the shop plugin config.
 *   2. Bypass the cart: create a Stripe payment intent directly from
 *      `total`/`currency` here and confirm the submission against it. Simpler,
 *      but the form's money then never appears in Orders alongside everything
 *      else sold, which is usually the wrong trade.
 *
 * Until one of those lands, a submission on a purchasable form is stored with
 * its priced lines and a `paymentStatus` of `unpaid`, and `checkoutUrl` is
 * null. The renderer says so rather than showing a pay button that does nothing.
 */
export type CheckoutHandoff = {
  formID: number | string
  submissionID?: number | string
  currency: string
  lines: LineItem[]
  total: number
  /** The product a line item would be booked against, when the form names one. */
  productID: number | string | null
  /** Null until the cart integration above is built. */
  checkoutUrl: string | null
  /** Why it is null, in words an operator can act on. */
  status: 'ready' | 'not-integrated' | 'free'
  message?: string
}

export function buildCheckoutHandoff(
  form: FormDoc,
  pricing: FormPricing,
  submissionID?: number | string,
): CheckoutHandoff {
  const product = form?.payment?.product
  const productID =
    product && typeof product === 'object' ? (product.id ?? null) : ((product as number | string) ?? null)

  const base: CheckoutHandoff = {
    formID: form?.id,
    submissionID,
    currency: pricing.currency,
    lines: pricing.lines,
    total: pricing.total,
    productID,
    checkoutUrl: null,
    status: 'not-integrated',
  }

  if (!form?.payment?.purchasable || pricing.total <= 0) {
    return { ...base, status: 'free', message: 'Nothing to pay for this submission.' }
  }

  return {
    ...base,
    message:
      'This entry has been priced and stored, but payment has not been taken - the cart handoff is not built yet. See the note in pricing.ts.',
  }
}
