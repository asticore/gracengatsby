import { allocate, percentOf, toCents } from './money'

export type CouponType = 'percent' | 'fixed_cart' | 'fixed_product' | 'free_shipping'

export type CouponDoc = {
  id?: number | string
  code: string
  type: CouponType
  /** percent: 0-100. fixed_*: whole dollars. */
  amount?: number | null
  enabled?: boolean | null
  expiresAt?: string | null
  /** Whole dollars. */
  minSpend?: number | null
  maxSpend?: number | null
  usageLimit?: number | null
  usageLimitPerUser?: number | null
  usageCount?: number | null
  individualUse?: boolean | null
  /** Comma-separated product ids. */
  includeProducts?: string | null
  excludeProducts?: string | null
  /** Comma-separated category values. */
  includeCategories?: string | null
  excludeCategories?: string | null
  excludeSaleItems?: boolean | null
}

export type CouponLine = {
  key: string
  productId: string
  categories: string[]
  quantity: number
  unitCents: number
  onSale?: boolean
  /** The line total after dynamic pricing rules, when those ran first. Defaults to unitCents x quantity. */
  totalCents?: number
}

export type CouponContext = {
  lines: CouponLine[]
  email?: string | null
  now?: Date
  /** How many times this email has already used this coupon (paid orders). */
  usesByThisCustomer?: number
  /** Coupons already applied to the cart. */
  alreadyApplied?: CouponDoc[]
}

export type CouponResult =
  | { ok: true; code: string; type: CouponType; discountCents: number; lineDiscounts: Record<string, number>; freeShipping: boolean }
  | { ok: false; error: string }

export const normalizeCode = (code: unknown): string => (typeof code === 'string' ? code.trim().toLowerCase() : '')

const list = (csv: string | null | undefined): string[] =>
  (csv ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

const lineTotal = (l: CouponLine) => l.totalCents ?? l.unitCents * l.quantity

/**
 * Validates a coupon against a cart and works out the discount, in cents.
 * Pure: usage counts and the cart are passed in. Every failure carries a
 * message that is safe to show the shopper.
 */
export function applyCoupon(coupon: CouponDoc | null | undefined, ctx: CouponContext): CouponResult {
  if (!coupon) return { ok: false, error: 'That coupon code was not found.' }
  const code = normalizeCode(coupon.code)
  const now = ctx.now ?? new Date()
  if (coupon.enabled === false) return { ok: false, error: `Coupon "${code}" is not active.` }
  if (coupon.expiresAt) {
    const exp = new Date(coupon.expiresAt).getTime()
    if (Number.isFinite(exp) && exp < now.getTime()) return { ok: false, error: `Coupon "${code}" has expired.` }
  }
  if (coupon.usageLimit && (coupon.usageCount ?? 0) >= coupon.usageLimit) {
    return { ok: false, error: `Coupon "${code}" has reached its usage limit.` }
  }
  if (coupon.usageLimitPerUser) {
    if (!ctx.email) return { ok: false, error: `Enter your email address to use coupon "${code}".` }
    if ((ctx.usesByThisCustomer ?? 0) >= coupon.usageLimitPerUser) {
      return { ok: false, error: `You have already used coupon "${code}" the maximum number of times.` }
    }
  }
  const applied = ctx.alreadyApplied ?? []
  if (applied.some((c) => normalizeCode(c.code) === code)) return { ok: false, error: `Coupon "${code}" is already applied.` }
  if (coupon.individualUse && applied.length > 0) return { ok: false, error: `Coupon "${code}" cannot be used with other coupons.` }
  if (applied.some((c) => c.individualUse)) return { ok: false, error: `Another coupon already applied cannot be combined with "${code}".` }

  const subtotal = ctx.lines.reduce((s, l) => s + lineTotal(l), 0)
  const min = toCents(coupon.minSpend ?? 0)
  const max = toCents(coupon.maxSpend ?? 0)
  if (min > 0 && subtotal < min) return { ok: false, error: `The minimum spend for coupon "${code}" is $${(min / 100).toFixed(2)}.` }
  if (max > 0 && subtotal > max) return { ok: false, error: `The maximum spend for coupon "${code}" is $${(max / 100).toFixed(2)}.` }

  if (coupon.type === 'free_shipping') {
    return { ok: true, code, type: coupon.type, discountCents: 0, lineDiscounts: {}, freeShipping: true }
  }

  const incP = list(coupon.includeProducts)
  const excP = list(coupon.excludeProducts)
  const incC = list(coupon.includeCategories)
  const excC = list(coupon.excludeCategories)
  const eligible = ctx.lines.filter((l) => {
    const pid = l.productId.toLowerCase()
    const cats = l.categories.map((c) => c.toLowerCase())
    if (coupon.excludeSaleItems && l.onSale) return false
    if (incP.length > 0 && !incP.includes(pid)) return false
    if (excP.includes(pid)) return false
    if (incC.length > 0 && !cats.some((c) => incC.includes(c))) return false
    if (excC.length > 0 && cats.some((c) => excC.includes(c))) return false
    return true
  })
  if (eligible.length === 0) return { ok: false, error: `Coupon "${code}" does not apply to the items in your cart.` }

  const lineDiscounts: Record<string, number> = {}
  const amount = coupon.amount ?? 0
  if (amount <= 0) return { ok: false, error: `Coupon "${code}" has no discount value.` }

  if (coupon.type === 'percent') {
    const pct = Math.min(100, amount)
    for (const l of eligible) lineDiscounts[l.key] = Math.min(lineTotal(l), percentOf(lineTotal(l), pct))
  } else if (coupon.type === 'fixed_product') {
    const per = toCents(amount)
    for (const l of eligible) lineDiscounts[l.key] = Math.min(lineTotal(l), per * l.quantity)
  } else {
    const eligibleTotal = eligible.reduce((s, l) => s + lineTotal(l), 0)
    const total = Math.min(toCents(amount), eligibleTotal)
    const parts = allocate(total, eligible.map(lineTotal))
    eligible.forEach((l, i) => {
      lineDiscounts[l.key] = Math.min(lineTotal(l), parts[i])
    })
  }
  const discountCents = Object.values(lineDiscounts).reduce((s, n) => s + n, 0)
  if (discountCents <= 0) return { ok: false, error: `Coupon "${code}" gives no discount on the items in your cart.` }
  return { ok: true, code, type: coupon.type, discountCents, lineDiscounts, freeShipping: false }
}
