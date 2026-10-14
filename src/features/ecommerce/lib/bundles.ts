/**
 * Product bundles: a product of type "bundle" made of component products with fixed quantities.
 * Pure, no I/O. The database side (pricing a bundle line, stock) lives in server/bundles.ts.
 *
 * A bundle is priced either at a fixed price (the product's regular price field, with its sale
 * schedule) or at the components' total less a percentage. Stock is worked out from the components,
 * never from the bundle itself.
 */

export type BundlePricing = 'fixed' | 'percent'

export const BUNDLE_MAX_ITEMS = 20

/** One component of a bundle, as stored on the bundle (`product` is an id or a populated product). */
export type BundleItemRow = { product?: unknown; quantity?: number | null }

/** A component with its quantity for ONE bundle. Snapshotted on the order line so later edits to a bundle do not change past stock. */
export type BundleContent = { productId: number; title: string; quantity: number }

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

const idOfRow = (value: unknown): number | null => {
  if (isId(value)) return value
  if (value && typeof value === 'object' && 'id' in value && isId((value as { id: unknown }).id)) return (value as { id: number }).id
  return null
}

export const bundlePricingOf = (value: unknown): BundlePricing => (value === 'percent' ? 'percent' : 'fixed')

/** Clamps a stored percentage to 0 to 100 (a missing value is no discount). */
export function bundleDiscountOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * The components of a bundle as { productId, quantity } for ONE bundle. Rows with no product or a
 * quantity below 1 are dropped; the same product listed twice is merged. Titles are not known here.
 */
export function bundleComponentRows(rows: unknown): Array<{ productId: number; quantity: number }> {
  const out: Array<{ productId: number; quantity: number }> = []
  for (const row of (Array.isArray(rows) ? rows : []) as BundleItemRow[]) {
    const productId = idOfRow(row?.product)
    const quantity = typeof row?.quantity === 'number' ? Math.floor(row.quantity) : 1
    if (productId === null || quantity < 1) continue
    const existing = out.find((item) => item.productId === productId)
    if (existing) existing.quantity += quantity
    else out.push({ productId, quantity })
  }
  return out
}

/**
 * Price of one bundle in whole cents. Fixed: the bundle's own price (`fixedCents`), or the components'
 * total when none is set. Percent: the components' total less the discount, rounded to a whole cent.
 */
export function bundleUnitCents(input: { pricing: BundlePricing; fixedCents: number | null; discountPct: number; componentCents: number }): number {
  if (input.pricing === 'percent') {
    const pct = bundleDiscountOf(input.discountPct)
    return Math.round((input.componentCents * (100 - pct)) / 100)
  }
  return input.fixedCents ?? input.componentCents
}

/** Stock lines for `quantity` bundles, from a snapshot or the live components. Each line draws on one component product. */
export function bundleStockLines(contents: Array<{ productId: number; quantity: number; title?: string }>, quantity: number): Array<{ productId: number; quantity: number; name: string }> {
  return contents.map((content) => ({ productId: content.productId, quantity: content.quantity * quantity, name: content.title ?? `Item ${content.productId}` }))
}

/** Save-time checks for a bundle. Product lookups (is a component published, is it a simple product) are done on the server when priced. */
export function bundleErrors(data: Record<string, unknown>, selfId?: number | string): Array<{ path: string; message: string }> {
  if (data.productType !== 'bundle') return []
  const errors: Array<{ path: string; message: string }> = []
  const rows = Array.isArray(data.bundleItems) ? (data.bundleItems as BundleItemRow[]) : []
  const parts = bundleComponentRows(rows)
  if (parts.length === 0) errors.push({ path: 'bundleItems', message: 'A bundle needs at least one product in it.' })
  if (rows.length > BUNDLE_MAX_ITEMS) errors.push({ path: 'bundleItems', message: `A bundle can hold at most ${BUNDLE_MAX_ITEMS} products.` })
  if (selfId != null && parts.some((part) => String(part.productId) === String(selfId))) errors.push({ path: 'bundleItems', message: 'A bundle cannot include itself.' })
  for (const row of rows) {
    if (typeof row?.quantity === 'number' && (!Number.isInteger(row.quantity) || row.quantity < 1)) {
      errors.push({ path: 'bundleItems', message: 'Each quantity in a bundle must be a whole number of 1 or more.' })
      break
    }
  }
  const pct = typeof data.bundleDiscountPercent === 'number' ? data.bundleDiscountPercent : null
  if (pct !== null && (pct < 0 || pct > 100)) errors.push({ path: 'bundleDiscountPercent', message: 'The bundle discount must be between 0 and 100.' })
  return errors
}
