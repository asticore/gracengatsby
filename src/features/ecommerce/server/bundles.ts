import { resolveCartLine, type CatalogueProduct } from '../catalogue'
import { bundleComponentRows, bundleDiscountOf, bundlePricingOf, bundleUnitCents, type BundleContent } from '../lib/bundles'
import { toCents } from '../lib/money'
import { quantityError } from '../lib/qtyLimits'
import { effectivePrice, type PriceFields } from '../pricing'

type Doc = Record<string, unknown>
export type BundleEngine = { findByID: (a: unknown) => Promise<Doc | null> }

export type BundleResult =
  | { ok: true; unitCents: number; componentCents: number; contents: BundleContent[]; weightGrams: number }
  | { ok: false; error: string }

const fail = (error: string): BundleResult => ({ ok: false, error })

/**
 * Prices and checks one bundle line from the database copy of the bundle and its components.
 * `reserved` holds the component quantities already promised to earlier cart lines (keyed
 * `productId:`), so two lines cannot both take the last unit. It is updated when the bundle is ok.
 * Components must be published simple products that are in stock; the bundle is only as available
 * as its least-stocked component.
 */
export async function resolveBundle(engine: BundleEngine, bundle: Doc, quantity: number, now: Date, reserved: Map<string, number>, alreadyInCart = 0, preordersOn = true): Promise<BundleResult> {
  if (bundle._status != null && bundle._status !== 'published') return fail('This product is not available.')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return fail('Invalid quantity.')
  const limit = quantityError(quantity, bundle as { minQty?: number | null; maxQty?: number | null }, quantity + Math.max(0, alreadyInCart))
  if (limit) return fail(limit)
  const rows = bundleComponentRows(bundle.bundleItems)
  if (rows.length === 0) return fail('This bundle has no products in it yet.')

  const contents: BundleContent[] = []
  const pending = new Map<string, number>()
  let componentCents = 0
  let weightGrams = 0
  for (const row of rows) {
    const child = (await engine.findByID({ collection: 'products', id: row.productId, depth: 0, overrideAccess: true }).catch((): null => null)) as (CatalogueProduct & Doc) | null
    if (!child || (child._status != null && child._status !== 'published')) return fail('A product in this bundle is not available.')
    const title = String(child.title ?? 'Item')
    if ((child.productType ?? 'simple') !== 'simple' || child.nameYourPrice) return fail(`${title} cannot be sold inside a bundle.`)
    const key = `${row.productId}:`
    const needed = quantity * row.quantity
    const resolved = resolveCartLine(child, null, needed, now, (reserved.get(key) ?? 0) + (pending.get(key) ?? 0), null, preordersOn)
    if (!resolved.ok) return fail(`${title}: ${(resolved as { error: string }).error}`)
    if (resolved.preorder) return fail(`${title} is on pre-order and cannot be sold inside a bundle.`)
    pending.set(key, (pending.get(key) ?? 0) + needed)
    componentCents += toCents(resolved.unitPrice) * row.quantity
    weightGrams += Math.round((typeof child.weight === 'number' ? child.weight : 0) * 1000) * row.quantity
    contents.push({ productId: row.productId, title, quantity: row.quantity })
  }
  for (const [key, n] of pending) reserved.set(key, (reserved.get(key) ?? 0) + n)

  const pricing = bundlePricingOf(bundle.bundlePricing)
  const fixed = effectivePrice(bundle as PriceFields, now)
  if (pricing === 'fixed' && fixed === null) return fail('This bundle has no price.')
  const unitCents = bundleUnitCents({
    pricing,
    fixedCents: fixed === null ? null : toCents(fixed),
    discountPct: bundleDiscountOf(bundle.bundleDiscountPercent),
    componentCents,
  })
  return { ok: true, unitCents, componentCents, contents, weightGrams }
}

/** The products inside one bundle with their titles and quantities, whether or not they are in stock today. */
export async function bundleContentsOf(engine: BundleEngine, bundle: Doc): Promise<BundleContent[]> {
  const out: BundleContent[] = []
  for (const row of bundleComponentRows(bundle.bundleItems)) {
    const child = (await engine.findByID({ collection: 'products', id: row.productId, depth: 0, overrideAccess: true }).catch((): null => null)) as Doc | null
    out.push({ productId: row.productId, title: child ? String(child.title ?? 'Item') : 'Item no longer available', quantity: row.quantity })
  }
  return out
}

/**
 * What the storefront shows for a bundle product page: the price as the product view should show it
 * (regular = components' total, sale = bundle price, for a percentage bundle), and whether it can be bought.
 */
export async function bundleStorefrontFields(engine: BundleEngine, bundle: Doc, now: Date, preordersOn = true): Promise<{ priceInAUD: number | null; salePrice: number | null; stockStatus: 'instock' | 'outofstock'; contents: BundleContent[] }> {
  const contents = await bundleContentsOf(engine, bundle)
  const result = await resolveBundle(engine, bundle, 1, now, new Map(), 0, preordersOn)
  if (!result.ok) {
    const fixed = effectivePrice(bundle as PriceFields, now)
    return { priceInAUD: fixed ?? null, salePrice: null, stockStatus: 'outofstock', contents }
  }
  const percent = bundlePricingOf(bundle.bundlePricing) === 'percent'
  const unit = result.unitCents / 100
  return {
    priceInAUD: percent ? result.componentCents / 100 : unit,
    salePrice: percent && result.unitCents < result.componentCents ? unit : null,
    stockStatus: 'instock',
    contents,
  }
}

/** Save-time check: every component of a bundle must be an existing simple product that is not a bundle or name-your-price. */
export async function bundleComponentErrors(engine: BundleEngine, bundle: Doc): Promise<Array<{ path: string; message: string }>> {
  if (bundle.productType !== 'bundle') return []
  const errors: Array<{ path: string; message: string }> = []
  for (const row of bundleComponentRows(bundle.bundleItems)) {
    const child = (await engine.findByID({ collection: 'products', id: row.productId, depth: 0, overrideAccess: true }).catch((): null => null)) as Doc | null
    if (!child) {
      errors.push({ path: 'bundleItems', message: `Product ${row.productId} in this bundle no longer exists.` })
    } else if ((child.productType ?? 'simple') !== 'simple' || child.nameYourPrice) {
      errors.push({ path: 'bundleItems', message: `"${String(child.title ?? 'A product')}" cannot be sold inside a bundle. Only simple products can.` })
    }
  }
  return errors
}
