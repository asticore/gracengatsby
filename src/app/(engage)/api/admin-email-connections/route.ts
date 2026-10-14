import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'
import { loadEmailSettings } from '@/features/email/connectionLoad'
import { summariseProviderState } from '@/features/email/providerState'

// Returns which email and text providers are connected, for the status notice
// on the Communication and Integrations screens. Names and yes/no only - never a
// key. Admin session only.

export async function GET(request: Request): Promise<Response> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: request.headers })

  if (!user || !(user as { roles?: string[] }).roles?.includes('admin')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const settings = await loadEmailSettings(engine as unknown as Parameters<typeof loadEmailSettings>[0])
  return NextResponse.json(summariseProviderState(settings))
}
