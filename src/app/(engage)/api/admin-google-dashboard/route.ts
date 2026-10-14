import { NextResponse } from 'next/server'
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { getAdminContext } from '@/admin/auth'
import type { Drizzle } from '@/localapi/migrate'
import type { EngineArg } from '@/features/google/dashboard/connection'
import { loadWidget } from '@/features/google/dashboard/widgets'
import { isWidgetKind } from '@/features/google/dashboard/types'

export const dynamic = 'force-dynamic'

/**
 * GET ?widget=search|analytics|speed|adsense
 * One dashboard widget as JSON, with a state (ok, not-connected, not-set-up, error). Admins only: the
 * numbers come from the connected Google account. Never returns tokens.
 */

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: noStore })

    const raw = new URL(request.url).searchParams.get('widget')
    if (!isWidgetKind(raw)) return NextResponse.json({ error: 'Invalid widget' }, { status: 400, headers: noStore })

    const { env } = await getCloudflareContext({ async: true })
    const db = drizzle(env.D1) as unknown as Drizzle
    const result = await loadWidget(raw, context.engine as unknown as EngineArg, db)
    return NextResponse.json(result, { status: 200, headers: noStore })
  } catch (error) {
    console.error('admin-google-dashboard GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStore })
  }
}
