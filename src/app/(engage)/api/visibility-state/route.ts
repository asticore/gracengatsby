import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store' }
const SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/

/**
 * GET /api/visibility-state - { loggedIn, roles } for the block "Visibility rules" script.
 * Role slugs only: no id, name or email. Never cached, because the page that asks is cached for everyone.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const engine = await getEngine()
    const { user } = await engine.auth({ headers: request.headers })
    if (!user) return NextResponse.json({ loggedIn: false, roles: [] }, { headers: HEADERS })
    const u = user as { roles?: unknown; customRole?: unknown }
    const roles: string[] = Array.isArray(u.roles) ? u.roles.filter((r): r is string => typeof r === 'string') : []
    const custom = u.customRole as { slug?: unknown } | null | undefined
    if (custom && typeof custom === 'object' && typeof custom.slug === 'string') roles.push(custom.slug)
    return NextResponse.json({ loggedIn: true, roles: roles.map((r) => r.toLowerCase()).filter((r) => SLUG.test(r)) }, { headers: HEADERS })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: HEADERS })
  }
}
