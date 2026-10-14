import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { isPickerKind } from '@/features/google/constants'
import { listFor, type PickerItem } from '@/features/google/lists'
import { GoogleApiError } from '@/features/google/fetchJson'
import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/admin-google-lists?kind=ga4|gsc|gtm|adsense: the choices for one
 * dropdown on the Google connection screen. Admins only.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403, headers: NO_STORE })

    const kind = request.nextUrl.searchParams.get('kind')
    if (!isPickerKind(kind)) return NextResponse.json({ ok: false, message: 'Choose a list to load.' }, { status: 400, headers: NO_STORE })

    const engine = await getEngine()
    const items: PickerItem[] = await listFor(engine, kind)
    return NextResponse.json({ ok: true, items }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof GoogleApiError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 502, headers: NO_STORE })
    }
    console.error('admin-google-lists error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, message: 'The list could not be loaded. Try again.' }, { status: 500, headers: NO_STORE })
  }
}
