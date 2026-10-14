import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { getEngine } from '@/lib/engine'
import { saveClient, validateClientInput } from '@/features/google/connectionSave'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * POST /api/admin-google-client { clientId, clientSecret }: saves the Google Cloud
 * client. A blank secret keeps the saved one. Admins only.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 403, headers: NO_STORE })

    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE })

    const input = validateClientInput(await request.json().catch((): null => null))
    if ('error' in input) return NextResponse.json({ ok: false, error: input.error }, { status: 400, headers: NO_STORE })

    const engine = await getEngine()
    const { signedOut } = await saveClient(engine, input)
    const message = signedOut
      ? 'Client saved. The old Google sign-in was ended, because it belonged to the previous client. Connect with Google again.'
      : 'Client saved.'
    return NextResponse.json({ ok: true, message, signedOut }, { headers: NO_STORE })
  } catch (error) {
    console.error('admin-google-client error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ ok: false, error: 'The client could not be saved. Try again.' }, { status: 500, headers: NO_STORE })
  }
}
