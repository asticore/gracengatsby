import type { CollectionBeforeChangeHook } from '@/engine'

import { collectSkus, normaliseCatalogue } from './normalize'
import type { VariationRow } from './variations'

type EngineLike = { find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }> }

async function throwValidation(errors: Array<{ path: string; message: string }>): Promise<never> {
  const { ValidationError } = await import('@/localapi/operations')
  throw new ValidationError(errors)
}

/** The title of another product that already uses one of these SKUs, with the SKU, or null. Bounded scan of up to 2000 products. */
export async function findSkuConflict(engine: EngineLike, skus: string[], selfId: number | string | undefined): Promise<{ sku: string; title: string } | null> {
  if (skus.length === 0) return null
  const wanted = new Set(skus.map((sku) => sku.toLowerCase()))
  const { docs } = await engine.find({ collection: 'products', limit: 2000, depth: 0, overrideAccess: true, draft: false })
  for (const doc of docs) {
    if (selfId != null && String(doc.id) === String(selfId)) continue
    const theirs = [typeof doc.sku === 'string' ? doc.sku : '', ...(((doc.variations as VariationRow[] | undefined) ?? []).map((variation) => variation.sku || ''))]
    for (const sku of theirs) if (sku && wanted.has(sku.toLowerCase())) return { sku, title: String(doc.title ?? doc.id) }
  }
  return null
}

/**
 * beforeChange on Products: computes stock status, validates prices, GTINs and variations, and
 * refuses a SKU another product already uses. Runs on drafts as well as publishes, so a clash is
 * caught as soon as it is typed rather than at publish time.
 */
export const catalogueBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const incoming = data as Record<string, unknown>
  const selfId = (originalDoc as { id?: number } | undefined)?.id
  // A partial update (say, only the stock quantity) is checked against the whole document.
  const merged: Record<string, unknown> = { ...((originalDoc as Record<string, unknown> | undefined) ?? {}), ...incoming }
  const errors = normaliseCatalogue(merged, selfId)
  if (errors.length > 0) await throwValidation(errors)
  for (const key of ['sku', 'gtin', 'stockQty', 'variations']) if (key in incoming) incoming[key] = merged[key]
  if (merged.manageStock) incoming.stockStatus = merged.stockStatus

  const skus = collectSkus(merged)
  if (skus.length > 0) {
    const conflict = await findSkuConflict((req as unknown as { engine: EngineLike }).engine, skus, selfId).catch((): null => null)
    if (conflict) await throwValidation([{ path: 'sku', message: `SKU "${conflict.sku}" is already used by "${conflict.title}".` }])
  }
  return data
}
