import { NextRequest, NextResponse } from 'next/server'

import { isPickerKind } from '@/features/google/constants'
import { listFor, type PickerItem } from '@/features/google/lists'
import { GoogleApiError } from '@/features/google/fetchJson'
import { gate, NO_STORE } from '@/features/tracking/connect/routeSupport'

export const dynamic = 'force-dynamic'

/** GET /api/tracking-connect/google/lists?kind=ga4|gtm: the properties or containers for the Tracking screen. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await gate(request)
    if ('response' in session) return session.response
    const kind = request.nextUrl.searchParams.get('kind')
    if (kind !== 'ga4' && kind !== 'gtm') return NextResponse.json({ ok: false, reason: 'bad-value' }, { status: 400, headers: NO_STORE })
    if (!isPickerKind(kind)) return NextResponse.json({ ok: false, reason: 'bad-value' }, { status: 400, headers: NO_STORE })
    const items: PickerItem[] = await listFor(session.deps.engine, kind)
    return NextResponse.json({ ok: true, items }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof GoogleApiError) return NextResponse.json({ ok: false, reason: 'google', message: error.message }, { status: 502, headers: NO_STORE })
    console.error('tracking connect google lists error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE })
  }
}
