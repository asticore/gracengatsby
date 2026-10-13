import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { getAdminContext } from '@/admin/auth'
import { getWorstPages } from '@/features/pagespeed/worst'
import { isStrategy, type Strategy } from '@/features/pagespeed/types'

export const dynamic = 'force-dynamic'

/**
 * GET ?strategy=mobile|desktop (default mobile)
 * The ten lowest-scoring pages from the stored PageSpeed results, latest run per page. Each row is limited
 * to what the viewer can open. Needs the "PageSpeed tests" permission (read).
 */

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })
    if (!context.isAdmin && !context.can('admin-pagespeed', 'read')) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })
    }

    const raw = new URL(request.url).searchParams.get('strategy') ?? 'mobile'
    if (!isStrategy(raw)) return NextResponse.json({ error: 'Invalid strategy' }, { status: 400, headers: noStore })
    const strategy: Strategy = raw

    const { env } = await getCloudflareContext({ async: true })
    const pages = await getWorstPages({
      db: drizzle(env.D1) as never,
      context: context as never,
      strategy,
    })
    return NextResponse.json({ strategy, pages }, { status: 200, headers: noStore })
  } catch (error) {
    console.error('admin-pagespeed-worst GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStore })
  }
}
