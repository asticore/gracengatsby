import { NextResponse } from 'next/server'

import { getEngine } from '@/lib/engine'
import { sendTestEmail } from '@/features/email'

// Sends the "is my provider set up correctly" test message, triggered by the
// button on the Email settings screen.
//
// Guarded by an admin session rather than the shared internal-route key. The
// other internal endpoints are called by the deploy pipeline, which can hold a
// secret; this one is called by a button in the browser, which cannot. An
// action that spends sending quota and puts mail in someone's inbox needs a
// real boundary, and the engine's own session handling is it.
//
// The recipient is not accepted from the request - it always comes from the
// stored test recipient, so this endpoint cannot be turned into a way to mail
// an arbitrary address.

export async function POST(request: Request): Promise<Response> {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: request.headers })

  if (!user || !(user as { roles?: string[] }).roles?.includes('admin')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await sendTestEmail()

  // Always 200: the body carries the verdict. A non-2xx here would be
  // indistinguishable from the route itself failing, and the point of this
  // screen is to tell the operator exactly what the provider said.
  return NextResponse.json(result)
}
