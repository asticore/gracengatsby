import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { loadThemeStyles, saveThemeStyles } from '@/features/themeStyles/store'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function adminRefusal(): Promise<Response | null> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (!context.isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE })
  return null
}

/** GET /api/admin-theme-styles: the saved theme styles (or the defaults). Admins only. */
export async function GET(): Promise<Response> {
  try {
    const refusal = await adminRefusal()
    if (refusal) return refusal
    const { styles, saved } = await loadThemeStyles()
    return NextResponse.json({ ok: true, styles, saved }, { headers: NO_STORE })
  } catch (error) {
    console.error('admin-theme-styles GET error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The theme styles could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}

/** POST /api/admin-theme-styles { styles }: sanitises and saves. Admins only. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const originRefusal = adminRequestRefusal(request)
    if (originRefusal) return NextResponse.json({ ok: false, error: originRefusal }, { status: 403, headers: NO_STORE })
    const refusal = await adminRefusal()
    if (refusal) return refusal

    const body = (await request.json().catch((): null => null)) as { styles?: unknown } | null
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.styles === undefined || body.styles === null || typeof body.styles !== 'object') {
      return NextResponse.json({ ok: false, error: 'Send a JSON body like { "styles": { ... } }.' }, { status: 400, headers: NO_STORE })
    }
    const styles = await saveThemeStyles(body.styles)
    return NextResponse.json({ ok: true, styles }, { headers: NO_STORE })
  } catch (error) {
    console.error('admin-theme-styles POST error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The theme styles could not be saved. Try again.' }, { status: 500, headers: NO_STORE })
  }
}