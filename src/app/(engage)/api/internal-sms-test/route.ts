import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'
import { sendTestText } from '@/features/sms'

// Sends the "is my text message setup working" test, triggered by the button on
// the Integrations page. Admin session only, like internal-email-test. The
// number is never taken from the request - it always comes from the saved test
// phone number - so this cannot be used to text an arbitrary number.

export async function POST(request: Request): Promise<Response> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: request.headers })

  if (!user || !(user as { roles?: string[] }).roles?.includes('admin')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Always 200: the body carries the verdict, so the operator sees the provider's words.
  return NextResponse.json(await sendTestText())
}
