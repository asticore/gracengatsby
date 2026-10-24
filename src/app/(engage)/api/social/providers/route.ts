import { handleProviders } from '@/features/socialLogin/http'
import { defaultRuntime } from '@/features/socialLogin/runtime'

export const dynamic = 'force-dynamic'

/** GET /api/social/providers?area=account|admin: which buttons to show. Names only, never credentials. */
export async function GET(request: Request): Promise<Response> {
  return handleProviders(request, await defaultRuntime())
}
