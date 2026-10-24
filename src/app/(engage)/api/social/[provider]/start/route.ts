import { handleStart } from '@/features/socialLogin/http'
import { runtimeWithVerification } from '@/features/socialLogin/runtime'

export const dynamic = 'force-dynamic'

/** GET /api/social/[provider]/start: begin sign-in, linking or an admin test. 404 when the provider is off. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider } = await params
  return handleStart(request, provider, await runtimeWithVerification())
}
