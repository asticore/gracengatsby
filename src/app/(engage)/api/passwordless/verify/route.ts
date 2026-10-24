import { verifyResponse } from '@/features/accounts/passwordlessHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passwordless/verify: exchanges an emailed six-digit code for a session. */
export async function POST(request: Request): Promise<Response> {
  return verifyResponse(request)
}
