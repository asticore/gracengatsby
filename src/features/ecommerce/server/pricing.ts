import { resolveCartLine, type CatalogueProduct } from '../catalogue'
import { resolveCheckoutFields, validateCheckoutValues, type CheckoutField } from '../lib/checkoutFields'
import { normalizeCode, type CouponDoc } from '../lib/coupons'
import { normalizeEmail } from '../lib/email'
import { toCents } from '../lib/money'
import { cleanRecipient, giftAmountError, normaliseGiftCardSettings } from '../lib/storedValue'
import { PAID_STATUSES } from '../lib/orderStatus'
import type { ShippingAddress, ShippingOption, ShippingZone } from '../lib/shipping'
import { DEFAULT_TAX_SETTINGS, type TaxClass, type TaxRate, type TaxSettings } from '../lib/tax'
import { fetchLiveRates, normaliseShippingConfig } from '../shipping/registry'
import { computeOrderTotals, type OrderTotals, type PricedLine } from '../lib/totals'

type Doc = Record<string, unknown>
export type PricingEngine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findByID: (a: unknown) => Promise<Doc | null>
  findGlobal: (a: unknown) => Promise<Doc>
}

export class CheckoutError extends Error {}

/** The shop's currency (single-currency shop; AUD unless shop settings say otherwise). */
export const shopCurrency = (config: { settings: Record<string, unknown> }): string => (typeof config.settings.currency === 'string' && /^[A-Za-z]{3}$/.test(config.settings.currency) ? config.settings.currency.toUpperCase() : 'AUD')

export type ShopConfig = { tax: TaxSettings; zones: ShippingZone[]; rates: TaxRate[]; fields: CheckoutField[]; settings: Doc }

const safeFind = async (engine: PricingEngine, collection: string, extra: Doc = {}): Promise<Doc[]> => {
  try {
    return ((await engine.find({ collection, limit: 500, depth: 0, overrideAccess: true, ...extra }))?.docs ?? []) as Doc[]
  } catch {
    return []
  }
}

export async function loadShopConfig(engine: PricingEngine): Promise<ShopConfig> {
  let settings: Doc = {}
  try {
    settings = ((await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) ?? {}) as Doc
  } catch {
    settings = {}
  }
  const t = (settings.tax ?? {}) as Doc
  const tax: TaxSettings = {
    enabled: t.enabled !== false,
    pricesIncludeTax: t.pricesIncludeTax !== false,
    defaultCountry: (typeof t.defaultCountry === 'string' && t.defaultCountry) || DEFAULT_TAX_SETTINGS.defaultCountry,
    storeRatePct: typeof t.storeRatePct === 'number' ? t.storeRatePct : DEFAULT_TAX_SETTINGS.storeRatePct,
  }
  const zones = (await safeFind(engine, 'shipping-zones', { sort: 'order' })) as unknown as ShippingZone[]
  const rates = (await safeFind(engine, 'tax-rates')) as unknown as TaxRate[]
  return { tax, zones, rates, fields: resolveCheckoutFields(settings.checkoutFields as never), settings }
}

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: number }).id) : Number(v) || null)

export type CartItemInput = {
  product?: unknown
  quantity?: number
  variation?: string | null
  /** Gift card lines: amount in cents chosen by the buyer, and who receives it. Validated here, never trusted. */
  customAmount?: number | null
  giftName?: string | null
  giftEmail?: string | null
  giftSenderName?: string | null
  giftMessage?: string | null
  giftSendAt?: string | null
}

async function loadGiftSettings(engine: PricingEngine) {
  try {
    const shop = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })
    return normaliseGiftCardSettings((shop as Doc | undefined)?.giftCards)
  } catch {
    return normaliseGiftCardSettings(null)
  }
}

/** A gift card line: the buyer's amount (checked against the shop's presets and limits) and recipient, no stock, no tax, no shipping. */
export function giftCardLine(product: Doc, item: CartItemInput, key: string, quantity: number, settings: ReturnType<typeof normaliseGiftCardSettings>): PricedLine {
  if (product._status != null && product._status !== 'published') throw new CheckoutError('This product is not available.')
  if (!settings.enabled) throw new CheckoutError('Gift cards are not available right now.')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new CheckoutError('You can buy up to 10 gift cards at a time.')
  const amountError = giftAmountError(item.customAmount, settings)
  if (amountError) throw new CheckoutError(amountError)
  const recipient = cleanRecipient({ name: item.giftName, email: item.giftEmail, senderName: item.giftSenderName, message: item.giftMessage, sendAt: item.giftSendAt })
  if (recipient.ok === false) throw new CheckoutError(recipient.error)
  const cents = item.customAmount as number
  return {
    key,
    productId: String(product.id),
    name: `${String(product.title ?? 'Gift card')} (${(cents / 100).toFixed(2)})`,
    sku: null,
    unitCents: cents,
    quantity,
    taxClass: 'zero',
    categories: [],
    onSale: false,
    weightGrams: 0,
    shippingClass: null,
    requiresShipping: false,
    isGiftCard: true,
    ...({ giftAmountCents: cents, recipient: recipient.value } as object),
  } as PricedLine
}

/** Loads each cart line from the database and prices it. Nothing here comes from the browser except ids and quantities. */
export async function loadPricedLines(engine: PricingEngine, items: CartItemInput[], now = new Date()): Promise<PricedLine[]> {
  const lines: PricedLine[] = []
  let giftSettings: ReturnType<typeof normaliseGiftCardSettings> | null = null
  const inCart = new Map<string, number>() // the same product listed twice must be available for the sum
  for (const [i, item] of items.entries()) {
    const productId = idOf(item.product)
    if (!productId) continue
    const product = (await engine.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true })) as (CatalogueProduct & Doc) | null
    const quantity = item.quantity ?? 1
    if (product && product.productType === 'giftcard') {
      lines.push(giftCardLine(product as Doc, item, String(i), quantity, giftSettings ?? (giftSettings = await loadGiftSettings(engine))))
      continue
    }
    const stockKey = `${productId}:${item.variation ?? ''}`
    const resolved = resolveCartLine(product, item.variation ?? null, quantity, now, inCart.get(stockKey) ?? 0)
    inCart.set(stockKey, (inCart.get(stockKey) ?? 0) + (Number.isInteger(quantity) ? quantity : 0))
    let unitPrice: number
    let title: string
    let sku: string | null
    let variationId: string | null = null
    let label: string | null = null
    if (resolved.ok) {
      unitPrice = resolved.unitPrice
      title = resolved.title
      sku = resolved.sku
      variationId = resolved.variationId
      label = resolved.variationLabel
    } else if (product && product.manageStock === undefined && typeof product.priceInAUD === 'number') {
      // Legacy product rows from before the catalogue fields existed.
      if (typeof product.inventory === 'number' && product.inventory < quantity) throw new CheckoutError('Product is out of stock or does not have enough inventory.')
      unitPrice = product.priceInAUD
      title = String(product.title ?? 'Item')
      sku = null
    } else {
      throw new CheckoutError((resolved as { error: string }).error)
    }
    const p = product as Doc
    const categories = [p.category, ...(Array.isArray(p.categories) ? p.categories : [])]
      .map((c) => (c && typeof c === 'object' ? ((c as Doc).slug ?? (c as Doc).id) : c))
      .filter((c): c is string | number => c != null && c !== '')
      .map(String)
    const taxClass = (['standard', 'reduced', 'zero'].includes(String(p.taxClass)) ? p.taxClass : 'standard') as TaxClass
    const weight = typeof p.weight === 'number' ? p.weight : 0 // kilograms
    const virtual = p.virtual === true || p.isVirtual === true || p.category === 'digital'
    lines.push({
      key: String(i),
      productId: String(productId),
      name: label ? `${title} - ${label}` : title,
      sku,
      unitCents: toCents(unitPrice),
      quantity,
      taxClass,
      categories,
      onSale: typeof p.salePrice === 'number' && unitPrice === p.salePrice,
      weightGrams: Math.round(weight * 1000),
      lengthCm: typeof p.length === 'number' ? p.length : null,
      widthCm: typeof p.width === 'number' ? p.width : null,
      heightCm: typeof p.height === 'number' ? p.height : null,
      shippingClass: idOf(p.shippingClass),
      requiresShipping: !virtual,
      // carried for the order snapshot
      ...({ variationId } as object),
    } as PricedLine)
  }
  return lines
}

export async function findCoupon(engine: PricingEngine, code: unknown): Promise<CouponDoc | null> {
  const c = normalizeCode(code)
  if (!c) return null
  const docs = await safeFind(engine, 'coupons', { where: { code: { equals: c } }, limit: 1 })
  return (docs[0] as unknown as CouponDoc) ?? null
}

/** How long a pending-payment order holds a coupon use for its buyer. */
export const COUPON_RESERVATION_MS = 30 * 60_000
const USES_SCAN_LIMIT = 200

const hasCode = (order: Doc, code: string) => ((order.couponLines as { code?: string }[] | null) ?? []).some((c) => normalizeCode(c.code) === code)

/**
 * Uses of the coupon by this person: paid orders from the same (normalised) address, plus pending-payment
 * orders created in the last 30 minutes, which hold a reservation so two simultaneous checkouts cannot both
 * pass a limit. The scan is capped. `excludeCartId` leaves out the buyer's own pending order for this cart.
 */
export async function couponUsesBy(engine: PricingEngine, code: string, email: string | null | undefined, opts: { excludeCartId?: number; now?: Date } = {}): Promise<number> {
  const target = normalizeEmail(email)
  if (!target) return 0
  const wanted = normalizeCode(code)
  const cutoff = (opts.now ?? new Date()).getTime() - COUPON_RESERVATION_MS
  const docs = await safeFind(engine, 'orders', { where: { customerEmail: { like: `${target.split('@')[0].slice(0, 1)}%` } }, limit: USES_SCAN_LIMIT, sort: '-createdAt' })
  return docs.filter((o) => {
    if (normalizeEmail(o.customerEmail) !== target || !hasCode(o, wanted)) return false
    if (PAID_STATUSES.includes(o.status as never)) return true
    return o.status === 'pending' && Number(o.cartId) !== opts.excludeCartId && new Date(String(o.createdAt)).getTime() >= cutoff
  }).length
}

/** Coupon uses currently reserved by recent pending-payment orders (counts toward the total usage limit). */
export async function couponReservations(engine: PricingEngine, code: string, opts: { excludeCartId?: number; now?: Date } = {}): Promise<number> {
  const wanted = normalizeCode(code)
  const cutoff = (opts.now ?? new Date()).getTime() - COUPON_RESERVATION_MS
  const docs = await safeFind(engine, 'orders', { where: { status: { equals: 'pending' } }, limit: USES_SCAN_LIMIT, sort: '-createdAt' })
  return docs.filter((o) => hasCode(o, wanted) && Number(o.cartId) !== opts.excludeCartId && new Date(String(o.createdAt)).getTime() >= cutoff).length
}

export type PriceInput = {
  items: CartItemInput[]
  address: ShippingAddress
  email?: string | null
  couponCode?: string | null
  shippingOptionId?: string | null
  /** Final checkout: shipping must be chosen and a bad coupon is an error. */
  strict?: boolean
  /** The cart being priced; its own pending order does not count as a reservation. */
  cartId?: number
}

type LiveResult = { options: ShippingOption[]; liveOn: boolean }
const LIVE_TTL_MS = 5 * 60_000
const LIVE_CACHE_MAX = 200
const liveCache = new Map<string, { at: number; options: ShippingOption[] }>()

/** Clears the short live-rate cache (tests). */
export const clearLiveRateCache = (): void => liveCache.clear()

/** Live carrier rates for the cart. `liveOn` says live rates are switched on, so an empty answer must not mean free shipping. Never throws. */
async function liveShippingOptions(engine: PricingEngine, lines: PricedLine[], address: ShippingAddress): Promise<LiveResult> {
  let liveOn = false
  try {
    if (!lines.some((l) => l.requiresShipping !== false) || !address.country || !address.postalCode) return { options: [], liveOn }
    const doc = await engine.findGlobal({ slug: 'shipping-settings', depth: 0, overrideAccess: true })
    const cfg = normaliseShippingConfig(doc)
    if (!cfg.liveRates) return { options: [], liveOn }
    liveOn = true
    const ship = lines.filter((l) => l.requiresShipping !== false)
    // Same destination postcode and same parcels give the same carrier answer, so repeat quotes reuse it for 5 minutes.
    const cacheKey = JSON.stringify([address.country, address.postalCode, ship.map((l) => [l.quantity, l.weightGrams ?? 0, l.lengthCm ?? null, l.widthCm ?? null, l.heightCm ?? null]), lines.reduce((s, l) => s + l.unitCents * l.quantity, 0)])
    const hitEntry = liveCache.get(cacheKey)
    if (hitEntry && Date.now() - hitEntry.at < LIVE_TTL_MS) return { options: hitEntry.options, liveOn }
    const a = address as Record<string, string | null | undefined>
    const out = await fetchLiveRates(cfg, {
      destination: { city: a.city ?? '', state: a.state ?? '', postcode: a.postalCode ?? '', country: a.country ?? '' },
      items: lines.filter((l) => l.requiresShipping !== false).map((l) => ({ quantity: l.quantity, weightKg: (l.weightGrams ?? 0) / 1000, lengthCm: l.lengthCm, widthCm: l.widthCm, heightCm: l.heightCm })),
      declaredValueCents: lines.reduce((s, l) => s + l.unitCents * l.quantity, 0),
    })
    if (out.options.length > 0) {
      if (liveCache.size >= LIVE_CACHE_MAX) liveCache.delete(liveCache.keys().next().value as string)
      liveCache.set(cacheKey, { at: Date.now(), options: out.options })
    }
    return { options: out.options, liveOn }
  } catch {
    return { options: [], liveOn }
  }
}

export async function priceCart(engine: PricingEngine, input: PriceInput, cfg?: ShopConfig): Promise<{ totals: OrderTotals; config: ShopConfig; lines: PricedLine[] }> {
  const config = cfg ?? (await loadShopConfig(engine))
  const lines = await loadPricedLines(engine, input.items)
  const code = normalizeCode(input.couponCode)
  let coupon = code ? await findCoupon(engine, code) : null
  const uses = coupon && input.email ? await couponUsesBy(engine, code, input.email, { excludeCartId: input.cartId }) : 0
  if (coupon?.usageLimit) {
    // Pending checkouts hold a use for 30 minutes so concurrent payers cannot overshoot the limit.
    const held = await couponReservations(engine, code, { excludeCartId: input.cartId })
    coupon = { ...coupon, usageCount: (coupon.usageCount ?? 0) + held }
  }
  const live = await liveShippingOptions(engine, lines, input.address)
  const result = computeOrderTotals({
    liveOptions: live.options,
    liveRatesOn: live.liveOn,
    lines,
    address: input.address,
    zones: config.zones,
    rates: config.rates,
    settings: config.tax,
    coupon,
    couponCode: code || null,
    email: input.email,
    usesByThisCustomer: uses,
    shippingOptionId: input.shippingOptionId,
    requireShipping: input.strict,
  })
  if (!result.ok) throw new CheckoutError((result as { error: string }).error)
  if (input.strict && result.couponError) throw new CheckoutError(result.couponError)
  return { totals: result as OrderTotals, config, lines }
}

export { validateCheckoutValues }
