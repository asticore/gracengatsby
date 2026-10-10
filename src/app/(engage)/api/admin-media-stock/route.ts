import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import { searchStock, STOCK_PROVIDERS, StockError, type StockProvider } from '@/features/media/stock'
import { readStockKeys, stockKeyAvailability, type MediaEngine } from '@/features/media/store'

/**
 * GET /api/admin-media-stock
 *   - with no q: which libraries are available (Openverse needs no key)
 *   - with q, provider, and optionally page: one page of results
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorizeMedia('create')
  if (!auth.context) return auth.response

  const engine = auth.context.engine as unknown as MediaEngine
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  if (!q) {
    const keyed = await stockKeyAvailability(engine)
    return NextResponse.json({ providers: { openverse: true, ...keyed } })
  }

  const provider = url.searchParams.get('provider') as StockProvider | null
  if (!provider || !STOCK_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Choose a photo library.' }, { status: 400 })
  }
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ error: 'Search for between 2 and 120 characters.' }, { status: 400 })
  }
  const rawPage = Number(url.searchParams.get('page') ?? '1')
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 50 ? rawPage : 1

  try {
    const keys = await readStockKeys(engine)
    return NextResponse.json(await searchStock(provider, q, page, keys))
  } catch (error) {
    if (error instanceof StockError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Stock search failed:', error)
    return NextResponse.json({ error: 'The photo library could not be searched. Try again shortly.' }, { status: 502 })
  }
}