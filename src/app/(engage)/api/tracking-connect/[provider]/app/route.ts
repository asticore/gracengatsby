import { NextRequest, NextResponse } from 'next/server'

import { adminRequestRefusal } from '@/features/forms/origin'
import { gate, providerFrom, NO_STORE } from '@/features/tracking/connect/routeSupport'
import { saveAppCredentials } from '@/features/tracking/connect/service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/**
 * POST /api/tracking-connect/[provider]/app { appId, appSecret }: saves the owner's
 * app ID and secret. Admins only. A blank secret keeps the saved one.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<Response> {
  const provider = providerFrom((await params).provider)
  if (!provider) return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404, headers: NO_STORE })
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return NextResponse.json({ ok: false, reason: 'refused' }, { status: 403, headers: NO_STORE })
    const session = await gate(request, { needsSecret: true })
    if ('response' in session) return session.response
    const body = (await request.json().catch((): null => null)) as { appId?: unknown; appSecret?: unknown } | null
    const appId = typeof body?.appId === 'string' ? body.appId.trim() : ''
    const appSecret = typeof body?.appSecret === 'string' ? body.appSecret.trim() : ''
    const result = await saveAppCredentials(session.deps, provider, { appId, appSecret: appSecret || null })
    if ('reason' in result) return NextResponse.json({ ok: false, reason: result.reason }, { status: 200, headers: NO_STORE })
    return NextResponse.json({ ok: true, signedOut: result.signedOut }, { headers: NO_STORE })
  } catch (error) {
    console.error('tracking connect app error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500, headers: NO_STORE })
  }
}
