import { handleCallback } from '@/features/socialLogin/http'
import { runtimeWithVerification } from '@/features/socialLogin/runtime'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/** GET /api/social/[provider]/callback: the provider sends the browser back here. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const { provider } = await params
  return handleCallback(request, provider, await runtimeWithVerification())
}

/** POST: Apple's form_post return. Bounced straight to the GET above so the state cookie travels. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const { provider } = await params
  return handleCallback(request, provider, await runtimeWithVerification())
}
