import { NextRequest, NextResponse } from 'next/server'

import { adminRequestRefusal } from '@/features/forms/origin'
import { applyPick, parsePickBody } from '@/features/google/picks'
import { gate, NO_STORE } from '@/features/tracking/connect/routeSupport'

export const dynamic = 'force-dynamic'

/**
 * POST /api/tracking-connect/google/pick { kind, value }: saves one Google choice
 * from the Tracking screen. The GA4 measurement ID or GTM container ID replaces
 * the one on Integrations, because the owner chose it here.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return NextResponse.json({ ok: false, reason: 'refused' }, { status: 403, headers: NO_STORE })
    const session = await gate(request)
    if ('response' in session) return session.response
    const input = parsePickBody(await request.json().catch((): null => null))
    if (!input) return NextResponse.json({ ok: false, reason: 'bad-value' }, { status: 400, headers: NO_STORE })
    const result = await applyPick(session.deps.engine, input, { fill: 'replace' })
    if ('error' in result) return NextResponse.json({ ok: false, reason: 'google', message: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json({ ok: true, value: result.value ?? '' }, { headers: NO_STORE })
  } catch (error) {
    console.error('tracking connect google pick error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE })
  }
}
