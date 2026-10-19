import React from 'react'

import { getEngine } from '@/lib/engine'
import { formatPriceInAUD } from '@/lib/formatCurrency'
import { loadShopCurrency } from '@/features/ecommerce/lib/shopCurrency'
import { buildMergeContext } from '@/lib/mergeTags'

import { DATE_FIELD, LoopView, loopSettings, loopWhere, sortField, stableRank } from './Wave50Elements'
import type { LoopItem, LoopSettings } from './Wave50Elements'

/**
 * Wave 50 server wrapper: `loop` is an ASYNC server component. It reads published items with the same engine and
 * buildMergeContext the Loop section block uses, then hands them to the sync LoopView. Any failure renders the
 * empty text, never an error. Optional props from the page: `page` (from ?page=) and `currentId` (for "related").
 */

const POOL = 200

type Engine = Awaited<ReturnType<typeof getEngine>>

async function fetchItems(s: LoopSettings, currentId: unknown): Promise<{ items: LoopItem[]; totalPages: number }> {
  const engine: Engine = await getEngine()
  let currency = 'AUD'
  try {
    currency = await loadShopCurrency(engine as never)
  } catch {
    // keep the default
  }
  const random = s.orderBy === 'random-stable'
  const sortKey = sortField(s)
  const direction = s.orderBy === 'menu order' && s.source === 'faqs' ? 'asc' : s.order
  const result = (await engine.find({
    collection: s.source,
    where: loopWhere(s, currentId),
    sort: `${direction === 'desc' ? '-' : ''}${sortKey}`,
    limit: random ? POOL : s.count,
    page: random ? 1 : s.page,
    depth: 1,
  } as never)) as unknown as { docs?: Record<string, unknown>[]; totalPages?: number }
  let docs = Array.isArray(result?.docs) ? result.docs : []
  let totalPages = Math.max(1, Math.round(Number(result?.totalPages) || 1))
  if (random) {
    docs = [...docs].sort((a, b) => stableRank(String(a.id)) - stableRank(String(b.id)))
    totalPages = Math.max(1, Math.ceil(docs.length / s.count))
    docs = docs.slice((Math.min(s.page, totalPages) - 1) * s.count, Math.min(s.page, totalPages) * s.count)
  }
  const items = docs.map((doc): LoopItem => {
    const ctx = buildMergeContext(doc, s.source, (amount) => formatPriceInAUD(amount, currency))
    const raw = doc[DATE_FIELD[s.source]]
    return {
      id: String(doc.id),
      title: ctx.title ?? '',
      url: ctx.url ?? '',
      image: ctx.image ?? '',
      excerpt: ctx.excerpt || (typeof doc.answer === 'string' ? doc.answer : ''),
      price: ctx.price ?? '',
      date: typeof raw === 'string' ? raw : '',
    }
  })
  return { items, totalPages }
}

/** `loop`: async server component. */
export async function LoopElement(props: Record<string, unknown>): Promise<React.ReactElement> {
  const s = loopSettings(props)
  let data: { items: LoopItem[]; totalPages: number } = { items: [], totalPages: 1 }
  try {
    data = await fetchItems(s, props.currentId)
  } catch {
    // fall through to the empty text
  }
  return <LoopView settings={s} items={data.items} totalPages={data.totalPages} />
}

/** Components for the wave-50 elements, keyed by elementType. Async: the lead registers them for server rendering. */
export const WAVE50_COMPONENTS: Record<string, (props: Record<string, unknown>) => Promise<React.ReactElement>> = {
  loop: LoopElement,
}
