import { applyCoupon, type CouponDoc } from './coupons'
import { quoteShipping, type ShippingAddress, type ShippingOption, type ShippingZone } from './shipping'
import { calcTax, type TaxClass, type TaxRate, type TaxSettings, type TaxSummaryLine } from './tax'

export type PricedLine = {
  key: string
  productId: string
  name: string
  sku?: string | null
  unitCents: number
  quantity: number
  taxClass: TaxClass
  categories: string[]
  onSale?: boolean
  weightGrams?: number | null
  shippingClass?: string | number | null
  requiresShipping?: boolean
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  /** Gift card lines are never discounted by a coupon. */
  isGiftCard?: boolean
  /** Set when the line is a pre-order: the release date (ISO) and the shop's note. */
  preorder?: { releaseDate: string | null; note: string | null } | null
}

export type OrderTotals = {
  ok: true
  lines: (PricedLine & { lineCents: number; discountCents: number; taxCents: number })[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  shippingOption: ShippingOption | null
  shippingOptions: ShippingOption[]
  taxCents: number
  taxLines: TaxSummaryLine[]
  pricesIncludeTax: boolean
  totalCents: number
  coupon: { code: string; type: string; discountCents: number; couponId?: number | string } | null
  couponError?: string
}

export type TotalsError = { ok: false; error: string }

/**
 * The single server-side money calculation: line prices from the database,
 * coupon, shipping and tax, all in integer cents. Checkout, the payment
 * intent and the stored order all come from this one function, so a total the
 * browser sends is never used.
 */
export function computeOrderTotals(args: {
  lines: PricedLine[]
  address: ShippingAddress
  zones: ShippingZone[]
  rates: TaxRate[]
  settings: TaxSettings
  coupon?: CouponDoc | null
  couponCode?: string | null
  email?: string | null
  usesByThisCustomer?: number
  shippingOptionId?: string | null
  /** Live carrier rates fetched by the caller; they replace the zone's paid options. */
  liveOptions?: ShippingOption[]
  /** Live carrier rates are switched on: an empty live answer with no zone option must fail, never become free shipping. */
  liveRatesOn?: boolean
  /** When true a missing/invalid shipping choice is an error instead of "not chosen yet". */
  requireShipping?: boolean
  now?: Date
}): OrderTotals | TotalsError {
  const { lines, address } = args
  if (lines.length === 0) return { ok: false, error: 'Your cart is empty.' }
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) return { ok: false, error: 'An item in your cart has an invalid quantity.' }
    if (!Number.isInteger(l.unitCents) || l.unitCents < 0) return { ok: false, error: `"${l.name}" does not have a valid price.` }
  }
  const subtotalCents = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0)

  let discounts: Record<string, number> = {}
  let discountCents = 0
  let freeShipping = false
  let coupon: OrderTotals['coupon'] = null
  let couponError: string | undefined
  if (args.couponCode) {
    const result = applyCoupon(args.coupon ?? null, {
      lines: lines.filter((l) => !l.isGiftCard).map((l) => ({ key: l.key, productId: l.productId, categories: l.categories, quantity: l.quantity, unitCents: l.unitCents, onSale: l.onSale })),
      email: args.email,
      now: args.now,
      usesByThisCustomer: args.usesByThisCustomer,
    })
    if (result.ok) {
      discounts = result.lineDiscounts
      discountCents = result.discountCents
      freeShipping = result.freeShipping
      coupon = { code: result.code, type: result.type, discountCents, couponId: args.coupon?.id }
    } else {
      couponError = (result as { error: string }).error
    }
  }

  const afterDiscount = subtotalCents - discountCents
  const zoneOptions = quoteShipping(
    {
      subtotalCents: afterDiscount,
      freeShipping,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        weightGrams: l.weightGrams,
        shippingClass: l.shippingClass,
        requiresShipping: l.requiresShipping,
      })),
    },
    address,
    args.zones,
  )
  const liveOptions = args.liveOptions ?? []
  const shippingOptions = freeShipping || liveOptions.length === 0 ? zoneOptions : [...liveOptions, ...zoneOptions.filter((o) => o.type === 'local_pickup' || o.type === 'free_over_amount')]
  const needsShipping = lines.some((l) => l.requiresShipping !== false)
  if (needsShipping && args.liveRatesOn && !freeShipping && liveOptions.length === 0 && zoneOptions.length === 0) return { ok: false, error: 'Shipping rates are unavailable right now. Please try again in a moment.' }
  let shippingOption: ShippingOption | null = null
  // A shop with no zones configured charges no shipping (existing stores keep working).
  if (needsShipping && (args.zones.length > 0 || liveOptions.length > 0)) {
    if (shippingOptions.length === 0 && args.requireShipping) return { ok: false, error: 'Sorry, we do not ship to that address.' }
    if (args.shippingOptionId) {
      shippingOption = shippingOptions.find((o) => o.id === args.shippingOptionId) ?? null
      if (!shippingOption && args.requireShipping) return { ok: false, error: 'The selected shipping method is not available for this address.' }
    } else if (args.requireShipping) {
      return { ok: false, error: 'Choose a shipping method.' }
    }
  }
  const shippingCents = shippingOption?.costCents ?? 0

  const tax = calcTax({
    lines: lines.map((l) => ({ key: l.key, amountCents: l.unitCents * l.quantity - (discounts[l.key] ?? 0), taxClass: l.taxClass })),
    shippingCents,
    shippingTaxable: shippingOption?.taxable,
    rates: args.rates,
    settings: args.settings,
    address,
  })
  const taxByKey = new Map(tax.lines.map((l) => [l.key, l.taxCents]))

  const totalCents = afterDiscount + shippingCents + tax.addedCents
  return {
    ok: true,
    lines: lines.map((l) => ({ ...l, lineCents: l.unitCents * l.quantity, discountCents: discounts[l.key] ?? 0, taxCents: taxByKey.get(l.key) ?? 0 })),
    subtotalCents,
    discountCents,
    shippingCents,
    shippingOption,
    shippingOptions,
    taxCents: tax.taxCents,
    taxLines: tax.taxLines,
    pricesIncludeTax: args.settings.pricesIncludeTax,
    totalCents,
    coupon,
    ...(couponError ? { couponError } : {}),
  }
}
