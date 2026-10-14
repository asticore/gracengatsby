import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import type { EngineArg } from '@/features/google/dashboard/connection'
import { loadPageStats } from '@/features/google/dashboard/pageStats'
import { isPageSpeedCollection } from '@/features/pagespeed/types'

export const dynamic = 'force-dynamic'

/**
 * GET ?collection=pages|posts|products|events&id=<number>
 * Search Console numbers for one published document: clicks, impressions, CTR, position and its top
 * queries. Admins only. The page address is built on the server from the document's own slug.
 */

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const params = new URL(request.url).searchParams
    const collection = params.get('collection')
    const id = Number(params.get('id'))
    if (!isPageSpeedCollection(collection) || !Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid document' }, { status: 400, headers: noStore })
    }

    const result = await loadPageStats(context.engine as unknown as EngineArg, { collection, id })
    return NextResponse.json(result, { status: 200, headers: noStore })
  } catch (error) {
    console.error('admin-google-page-stats GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStore })
  }
}
