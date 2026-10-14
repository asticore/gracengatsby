import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { getEngine } from '@/lib/engine'
import { REVOKE_URL } from '@/features/google/constants'
import { readGoogleDoc } from '@/features/google/auth'
import { requestJson } from '@/features/google/http'
import { clearSignIn } from '@/features/google/connectionSave'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * POST /api/google/disconnect: admins only. Asks Google to revoke the sign-in
 * (best effort), then forgets it and every chosen property. The client ID and
 * secret stay, so reconnecting is one click.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 403, headers: NO_STORE })

    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE })

    const engine = await getEngine()
    const doc = await readGoogleDoc(engine)
    const token = typeof doc?.refreshTokenEnc === 'string' ? doc.refreshTokenEnc.trim() : ''
    if (token) {
      await requestJson(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      }).catch((): null => null)
    }
    await clearSignIn(engine)
    return NextResponse.json({ ok: true, message: 'Google is disconnected.' }, { headers: NO_STORE })
  } catch (error) {
    console.error('google disconnect error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'Google could not be disconnected. Try again.' }, { status: 500, headers: NO_STORE })
  }
}
