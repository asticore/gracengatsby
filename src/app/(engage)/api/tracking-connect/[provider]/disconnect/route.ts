import { NextRequest, NextResponse } from 'next/server'

import { adminRequestRefusal } from '@/features/forms/origin'
import { gate, providerFrom, NO_STORE } from '@/features/tracking/connect/routeSupport'
import { disconnect } from '@/features/tracking/connect/service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/** POST /api/tracking-connect/[provider]/disconnect: revokes where the provider allows it, then deletes the token here. */
export async function POST(request: NextRequest, { params }: Ctx): Promise<Response> {
  const provider = providerFrom((await params).provider)
  if (!provider) return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404, headers: NO_STORE })
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return NextResponse.json({ ok: false, reason: 'refused' }, { status: 403, headers: NO_STORE })
    const session = await gate(request)
    if ('response' in session) return session.response
    const result = await disconnect(session.deps, provider)
    return NextResponse.json({ ok: true, revokedAtProvider: result.revokedAtProvider }, { headers: NO_STORE })
  } catch (error) {
    console.error('tracking connect disconnect error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE })
  }
}
