import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { getDevelopmentMode, loadCloudflareZone, setDevelopmentMode, type DevModeResult } from '@/features/speed/devMode'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const missingZone: DevModeResult = {
  ok: false,
  value: null,
  minutesRemaining: null,
  message: 'Add the Zone ID and API token under Integrations > Cloudflare first.',
}

/** Admins, or anyone who may update Integrations, can read and change development mode. */
async function allowed(): Promise<boolean> {
  const context = await getAdminContext()
  return context.isAdmin || context.can('settings:integrations', 'update')
}

/** GET: the current development mode state. */
export async function GET(): Promise<Response> {
  try {
    if (!(await allowed())) return NextResponse.json({ ok: false, message: 'You do not have permission.' }, { status: 403, headers: NO_STORE })
    const zone = await loadCloudflareZone()
    const result = zone ? await getDevelopmentMode(zone) : missingZone
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    console.error('admin-cloudflare-dev-mode GET error:', error)
    return NextResponse.json({ ok: false, message: 'Something went wrong. Try again.' }, { status: 500, headers: NO_STORE })
  }
}

/** POST { value: 'on' | 'off' }: switches development mode. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (!(await allowed())) return NextResponse.json({ ok: false, message: 'You do not have permission.' }, { status: 403, headers: NO_STORE })
    const body = (await request.json().catch((): null => null)) as { value?: unknown } | null
    if (body?.value !== 'on' && body?.value !== 'off') {
      return NextResponse.json({ ok: false, message: 'Choose on or off.' }, { status: 400, headers: NO_STORE })
    }
    const zone = await loadCloudflareZone()
    const result = zone ? await setDevelopmentMode(zone, body.value) : missingZone
    return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: NO_STORE })
  } catch (error) {
    console.error('admin-cloudflare-dev-mode POST error:', error)
    return NextResponse.json({ ok: false, message: 'Something went wrong. Try again.' }, { status: 500, headers: NO_STORE })
  }
}
