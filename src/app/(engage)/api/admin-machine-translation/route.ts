import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { charsUsedThisMonth } from '@/features/multilingual/machine/usage'
import { machineKeysPresent, testMachineProvider } from '@/features/multilingual/machine/service'
import { isMachineProviderId } from '@/features/multilingual/machine/providers'
import { getMultilingualSettings } from '@/features/multilingual/settings'

export const dynamic = 'force-dynamic'

/**
 * Machine translation on the Languages screen.
 *
 * GET: this month's character usage, the monthly limit, and which providers have a
 * key set (presence only, never the key).
 * POST { provider }: Test connection. Admins only. Sends one short string.
 */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.can('translations', 'read')) {
      return NextResponse.json({ error: 'You may not view translations.' }, { status: 403 })
    }
    const settings = await getMultilingualSettings(context.engine as never)
    const usedChars = await charsUsedThisMonth()
    const keys = await machineKeysPresent(context.engine as never)
    return NextResponse.json(
      { usedChars, monthlyCharLimit: settings.machine.monthlyCharLimit, keys },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('admin-machine-translation GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) return NextResponse.json({ error: 'Only an admin may test a connection.' }, { status: 403 })
    const body = (await request.json().catch((): null => null)) as { provider?: unknown } | null
    if (!body || !isMachineProviderId(body.provider)) {
      return NextResponse.json({ error: 'Choose a provider to test.' }, { status: 400 })
    }
    const outcome = await testMachineProvider({ engine: context.engine as never, provider: body.provider })
    if (outcome.ok === false) {
      return NextResponse.json({ ok: false, error: outcome.message }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ ok: true, message: 'Connected. The provider answered a test request.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-machine-translation POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
