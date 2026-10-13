/**
 * Records a back-in-stock sign-up. Only an out-of-stock product (or variation) takes one, only while
 * the Shop setting is on, and only once per person while a sign-up is still pending. Every
 * "nothing to do" answer looks the same to the caller, so the endpoint never reveals stock levels,
 * unknown products or other people's addresses.
 */

import { BACK_IN_STOCK_THANKS, checkSignup, effectiveStock, signupKey, type BackInStockInput, type CleanSignup } from './lib/backInStock'
import { computeStockStatus, type StockFields } from './stock'
import type { VariationRow } from './variations'

type Doc = Record<string, unknown>
export type BackInStockEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Doc[] }>
  findByID: (args: Record<string, unknown>) => Promise<Doc | null>
  findGlobal: (args: Record<string, unknown>) => Promise<Doc | null>
  create: (args: Record<string, unknown>) => Promise<Doc>
}

export type SignupResult = { kind: 'invalid'; errors: Record<string, string> } | { kind: 'off' } | { kind: 'done'; message: string }

/** Checks the input and, when it is a real out-of-stock item, stores one pending sign-up. Never throws on bad data. */
export async function recordBackInStockSignup(engine: BackInStockEngine, input: BackInStockInput): Promise<SignupResult> {
  const checked = checkSignup(input)
  if (checked.ok === false) {
    // A bot gets the same thank-you as a person, and nothing is stored.
    if (!('errors' in checked)) return { kind: 'done', message: BACK_IN_STOCK_THANKS }
    return { kind: 'invalid', errors: checked.errors }
  }
  const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  const storefront = (settings?.storefront ?? {}) as { backInStock?: boolean | null }
  if (storefront.backInStock === false) return { kind: 'off' }

  // Whether or not a row was written, the answer is the same: the caller learns nothing about stock.
  await storeIfOutOfStock(engine, checked.signup)
  return { kind: 'done', message: BACK_IN_STOCK_THANKS }
}

/** Stores the sign-up when the item is out of stock and nobody has a pending sign-up for it. Returns whether a row was written. */
async function storeIfOutOfStock(engine: BackInStockEngine, signup: CleanSignup): Promise<boolean> {
  const product = await engine.findByID({ collection: 'products', id: signup.productId, depth: 0, overrideAccess: true }).catch((): null => null)
  if (!product || product._status !== 'published') return false
  const variations = (product.variations as VariationRow[] | undefined) ?? []
  let stock = product as StockFields
  if (variations.length > 0 || signup.variation) {
    const row = variations.find((variation) => variation.id === signup.variation)
    if (!row || row.enabled === false) return false
    stock = effectiveStock(row, product as StockFields)
  }
  if (computeStockStatus(stock) !== 'outofstock') return false

  const { docs } = await engine.find({
    collection: 'stock-subscriptions',
    where: { and: [{ product: { equals: signup.productId } }, { status: { equals: 'pending' } }] },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const key = signupKey(signup)
  if (docs.some((doc) => signupKey({ productId: signup.productId, variation: (doc.variation as string | null) ?? '', email: String(doc.email ?? '') }) === key)) return false

  await engine.create({
    collection: 'stock-subscriptions',
    data: { product: signup.productId, variation: signup.variation || null, email: signup.email, status: 'pending' },
    overrideAccess: true,
  })
  return true
}
