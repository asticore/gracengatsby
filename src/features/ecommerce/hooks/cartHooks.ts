/**
 * Cart-specific hooks (Stage 10 Ecommerce, Layer 2 - see
 * the plan doc). Reproduced from the real ecommerce plugin's
 * `beforeChange.js` (`the vendor package@3.88.0`), simplified for
 * this app's single-currency (AUD-only) setup - no `priceIn${currency}`
 * lookup, no variants (`engage.config.ts`'s shop config has `variants:
 * false`).
 *
 * `req.engine` is this app's own `Engine` (see `../../../engine/index.ts`'s
 * header for why the hook's own type still names it `EngineRequest` even
 * though the object handed in at runtime is ours) - `findByID` is one of the
 * methods the two share, so this reads the same as it would against real
 * The original engine.
 */

import crypto from 'crypto'

import { resolveCartLine, type CatalogueProduct } from '../catalogue'

import { giftCardLine, type CartItemInput } from '../server/pricing'
import { loadPreordersEnabled } from '../server/shopExtra'
import { loadShopRulesConfig } from '../server/pricingRules'
import { normaliseAddOnDefs, parseAddOnInputs, priceAddOns, storeAddOnChoices } from '../lib/addOns'
import { resolveBundle } from '../server/bundles'
import { normaliseGiftCardSettings } from '../lib/storedValue'

type CartItem = {
  product?: number | { id: number } | null
  variation?: string | null
  quantity?: number | null
  priceCents?: number | null
  customAmount?: number | null
  giftName?: string | null
  giftEmail?: string | null
  giftSenderName?: string | null
  giftMessage?: string | null
  giftSendAt?: string | null
  /** Product add-on answers, stored as JSON text once the hook has checked them. */
  addOns?: unknown
}

const productIdOf = (item: CartItem): number | null | undefined =>
  item.product && typeof item.product === 'object' ? item.product.id : (item.product as number | null | undefined)

/**
 * `beforeChange` on the Carts collection.
 *
 * - Generates a guest-access `secret` on creation, same as the reference engine's
 *   `crypto.randomBytes(20).toString('hex')` - only when the cart has no
 *   `customer` (an authenticated user's cart doesn't need one; access is
 *   already `isDocumentOwner`).
 * - Recalculates `subtotal` from the current `items` array every save, so a
 *   client can never post its own total. Each line is priced from the database copy of the
 *   product (or the chosen variation) through `resolveCartLine`: sale schedule, stock and
 *   purchasability are checked server-side, and a line that cannot be bought is refused
 *   unless it was already in the cart unchanged (so a cart can always be tidied).
 */
// Untyped params deliberately (matches this repo's other inline collection hooks).
export const beforeChangeCart = async ({ data, originalDoc, operation, req }: Record<string, unknown> & { data: Record<string, unknown> }) => {
  if (operation === 'create' && !data.customer && !data.secret) {
    data.secret = crypto.randomBytes(20).toString('hex')
  }

  const items = data.items as CartItem[] | undefined
  if (Array.isArray(items)) {
    let subtotal = 0
    const engine = (req as { engine: { findByID: (args: { collection: string; id: number; depth?: number; overrideAccess?: boolean }) => Promise<unknown>; findGlobal: (args: { slug: string; depth?: number; overrideAccess?: boolean }) => Promise<unknown> } }).engine
    const before = ((originalDoc as { items?: CartItem[] } | undefined)?.items ?? []).map((item) => `${productIdOf(item)}|${item.variation ?? ''}|${item.quantity}`)
    const seen = new Map<string, number>()
    const reservedParts = new Map<string, number>() // component stock promised to bundle lines in this cart
    const errors: Array<{ path: string; message: string }> = []
    const preordersOn = await loadPreordersEnabled(engine)
    const addOnsOn = (await loadShopRulesConfig(engine as never)).addOnsOn
    for (const [index, item] of items.entries()) {
      const productId = productIdOf(item)
      if (!productId || !item.quantity) continue
      const product = (await engine.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true }).catch((): null => null)) as CatalogueProduct | null
      // A password-protected product can only be added by a visitor who has unlocked it. A line already in the cart can still be tidied.
      if (product && !before.includes(`${productId}|${item.variation ?? ''}|${item.quantity}`)) {
        // Lazy import: gate -> connect -> schema is built from the collections, which import this file.
        const { getPasswordGateStateForHeaders } = await import('@/features/visibility/gate')
        const gate = await getPasswordGateStateForHeaders({ collection: 'products', id: Number(productId), headers: (req as { headers?: Headers }).headers })
        if (gate === 'locked') {
          errors.push({ path: `items.${index}`, message: 'This product is password protected.' })
          continue
        }
      }
      if (product && (product as { productType?: string }).productType === 'giftcard') {
        // A gift card is priced from the buyer's amount, checked against the shop's limits and recipient rules.
        const shop = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)) as { giftCards?: unknown } | null
        try {
          const g = giftCardLine(product as never, item as CartItemInput, String(index), item.quantity, normaliseGiftCardSettings(shop?.giftCards))
          subtotal += (g.unitCents * item.quantity) / 100
        } catch (error) {
          errors.push({ path: `items.${index}`, message: error instanceof Error ? error.message : 'This gift card is not valid.' })
        }
        continue
      }
      if (product && (product as { productType?: string }).productType === 'bundle') {
        const bundle = await resolveBundle(engine as never, product as never, item.quantity, new Date(), reservedParts, seen.get(`${productId}|`) ?? 0, preordersOn)
        seen.set(`${productId}|`, (seen.get(`${productId}|`) ?? 0) + item.quantity)
        if (bundle.ok) {
          subtotal += (bundle.unitCents * item.quantity) / 100
          continue
        }
        const unchangedBundle = before.includes(`${productId}|${item.variation ?? ''}|${item.quantity}`)
        if (!unchangedBundle) errors.push({ path: `items.${index}`, message: (bundle as { error: string }).error })
        continue
      }
      const key = `${productId}|${item.variation ?? ''}`
      const already = seen.get(key) ?? 0
      seen.set(key, already + item.quantity)
      const line = resolveCartLine(product, item.variation ?? null, item.quantity, new Date(), already, item.priceCents ?? null, preordersOn)
      if (line.ok) {
        // Add-on answers are checked against the product and priced; only the accepted answers are kept on the line.
        const addOnPriced = priceAddOns(addOnsOn ? normaliseAddOnDefs((product as { addOns?: unknown } | null)?.addOns) : [], addOnsOn ? parseAddOnInputs(item.addOns) : [])
        if (!addOnPriced.ok) {
          errors.push({ path: `items.${index}`, message: addOnPriced.error ?? 'Please check the options you chose.' })
          continue
        }
        item.addOns = storeAddOnChoices(addOnPriced.choices)
        subtotal += line.unitPrice * item.quantity + (addOnPriced.cents * item.quantity) / 100
        continue
      }
      const unchanged = before.includes(`${productId}|${item.variation ?? ''}|${item.quantity}`)
      if (!unchanged) errors.push({ path: `items.${index}`, message: (line as { error: string }).error })
      else if (product && typeof product.priceInAUD === 'number') subtotal += product.priceInAUD * item.quantity
    }
    if (errors.length > 0) {
      const { ValidationError } = await import('@/localapi/operations')
      throw new ValidationError(errors)
    }
    data.subtotal = subtotal
  } else {
    data.subtotal = 0
  }

  return data
}

/**
 * `status` field-level `afterRead` hook (Stage 10 Ecommerce, Layer 2
 * remainder). Reproduced verbatim from the real ecommerce plugin's
 * `statusBeforeRead.js`: `'purchased'` once `purchasedAt` is set, `'active'`
 * for a cart created within the last 7 days, otherwise `'abandoned'`.
 *
 * This is a plain FIELD-level hook, not a collection-level one - the
 * `status` field on `../collections/Carts.ts` declares `virtual: true` (no
 * DB column - see `src/cms/db/schema/generate.ts`'s virtual-field skip) plus
 * `hooks: {afterRead: [cartStatusAfterRead]}`, and this app's own engine
 * already runs field-level `afterRead` hooks generically for any field that
 * declares one (`src/localapi/read-operations.ts`'s `traverseField`) - no
 * engine change was needed for this, only for realizing the field didn't
 * need the (unsupported) COLLECTION-level `afterRead` this project's earlier
 * notes assumed it did.
 *
 * `data` here is the whole doc (siblings), matching the reference engine's own
 * `AfterReadFieldHookArgs.data` - untyped for the same reason
 * `beforeChangeCart` above is.
 */
export const cartStatusAfterRead = ({ data }: { data?: Record<string, unknown> }): 'active' | 'purchased' | 'abandoned' => {
  if (data?.purchasedAt) return 'purchased'
  if (data?.createdAt) {
    const createdAt = new Date(data.createdAt as string).getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - createdAt < sevenDaysMs) return 'active'
  }
  return 'abandoned'
}
