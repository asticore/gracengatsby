import { handlePending } from '@/features/socialLogin/http'
import { defaultRuntime } from '@/features/socialLogin/runtime'

export const dynamic = 'force-dynamic'

/** GET /api/social/pending: the admin login screen collects the parked two-step token. */
export async function GET(request: Request): Promise<Response> {
  return handlePending(request, await defaultRuntime())
}
