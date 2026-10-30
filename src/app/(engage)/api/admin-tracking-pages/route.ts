import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import { trackingApiGate } from '@/features/tracking/apiGate'

export const dynamic = 'force-dynamic'

export type TrackingPageOption = { kind: 'page' | 'post' | 'product' | 'shop' | 'cart' | 'checkout'; title: string; path: string }

const LIMIT = 500

/**
 * The pages the tag editor's page finder can jump to: every published page on this site, the blog posts and products,
 * and the shop, cart and checkout. Admin only. Paths are the public ones, without a language prefix.
 */
export async function GET(): Promise<NextResponse> {
  const denied = await trackingApiGate('read')
  if (denied) return denied

  const options: TrackingPageOption[] = [
    { kind: 'shop', title: 'Shop', path: '/shop' },
    { kind: 'cart', title: 'Cart', path: '/cart' },
    { kind: 'checkout', title: 'Checkout', path: '/checkout' },
  ]
  const pages = await getAllResolvedPages().catch((): never[] => [])
  for (const item of pages) {
    const path = item.page.isHomepage ? '/' : `/${item.path.join('/')}`
    options.push({ kind: 'page', title: String(item.page.title ?? path), path })
  }

  try {
    const engine = await getEngine()
    for (const [collection, kind, prefix] of [
      ['posts', 'post', '/blog'],
      ['products', 'product', '/shop'],
    ] as const) {
      const { docs } = (await engine.find({ collection, limit: LIMIT, depth: 0, overrideAccess: true })) as { docs: Record<string, unknown>[] }
      for (const doc of docs) {
        const slug = typeof doc.slug === 'string' ? doc.slug : ''
        if (!slug) continue
        options.push({ kind, title: String(doc.title ?? slug), path: `${prefix}/${slug}` })
      }
    }
  } catch {
    // The finder still works with the pages it has.
  }
  return NextResponse.json({ pages: options })
}
