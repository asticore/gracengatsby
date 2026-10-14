/**
 * afterChange on Products: when a save puts an item back in stock, emails each person who asked to
 * hear about it, once, and marks their sign-up as sent. Never throws, so a failed email cannot fail
 * the save.
 */

import type { CollectionAfterChangeHook } from '@/engine'

import { restockedVariations } from './lib/backInStock'
import type { VariationRow } from './variations'

type Doc = Record<string, unknown>
type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Doc[] }>
  findGlobal: (args: Record<string, unknown>) => Promise<Doc | null>
  update: (args: Record<string, unknown>) => Promise<Doc>
}

const SIGNUP_BATCH = 500

/** Emails the pending sign-ups for these items (variation ids, or '' for a simple product). Returns how many were sent. */
export async function notifyBackInStock(engine: EngineLike, product: { id: number | string; title?: string; slug?: string; variations?: VariationRow[] | null }, back: string[]): Promise<number> {
  const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  const storefront = (settings?.storefront ?? {}) as { backInStock?: boolean | null }
  if (storefront.backInStock === false) return 0

  const { docs } = await engine.find({
    collection: 'stock-subscriptions',
    where: { and: [{ product: { equals: product.id } }, { status: { equals: 'pending' } }] },
    limit: SIGNUP_BATCH,
    depth: 0,
    overrideAccess: true,
  })
  const wanted = new Set(back)
  const { sendEmail } = await import('@/features/email')
  const baseUrl = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/+$/, '')
  let sent = 0
  for (const doc of docs) {
    const variation = (doc.variation as string | null) ?? ''
    if (!wanted.has(variation) || typeof doc.email !== 'string') continue
    const row = variation ? product.variations?.find((item) => item.id === variation) : undefined
    const label = `${product.title || 'Product'}${row?.attributeValues ? ` (${row.attributeValues.replace(/\|/g, ', ')})` : ''}`.replace(/[\r\n]+/g, ' ')
    const url = `${baseUrl}/shop/${product.slug ?? ''}`
    const result = await sendEmail({
      to: doc.email,
      template: 'stock.back-in-stock',
      subject: `Back in stock: ${label}`,
      text: `Good news. ${label} is back in stock.\n\nSee it here: ${url}\n\nYou asked us to let you know, so this is the only email we will send about it.`,
    }).catch((): { ok: false } => ({ ok: false }))
    if (!result.ok) continue
    await engine.update({ collection: 'stock-subscriptions', id: doc.id as number, data: { status: 'sent', notifiedAt: new Date().toISOString() }, overrideAccess: true })
    sent += 1
  }
  return sent
}

/** afterChange on Products: notifies when this save took an item from out of stock to in stock. */
export const backInStockAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (!previousDoc || !doc || (doc as { _status?: string })._status === 'draft') return doc
  try {
    const back = restockedVariations(previousDoc as never, doc as never)
    if (back.length > 0) await notifyBackInStock((req as unknown as { engine: EngineLike }).engine, doc as never, back)
  } catch {
    /* notification only */
  }
  return doc
}
