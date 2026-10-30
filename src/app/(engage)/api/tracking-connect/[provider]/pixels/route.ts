import { NextRequest, NextResponse } from 'next/server'

import { gate, providerFrom, NO_STORE } from '@/features/tracking/connect/routeSupport'
import { listPixelChoices } from '@/features/tracking/connect/service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/** GET /api/tracking-connect/[provider]/pixels: the pixels the signed-in account can use, for the picker. */
export async function GET(request: NextRequest, { params }: Ctx): Promise<Response> {
  const provider = providerFrom((await params).provider)
  if (!provider) return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404, headers: NO_STORE })
  try {
    const session = await gate(request)
    if ('response' in session) return session.response
    const result = await listPixelChoices(session.deps, provider)
    if ('reason' in result) return NextResponse.json({ ok: false, reason: result.reason }, { status: 200, headers: NO_STORE })
    return NextResponse.json({ ok: true, items: result.items }, { headers: NO_STORE })
  } catch (error) {
    console.error('tracking connect pixels error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE })
  }
}
