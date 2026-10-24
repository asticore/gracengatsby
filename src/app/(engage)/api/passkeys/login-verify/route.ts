import { loginVerifyResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/login-verify: checks a passkey sign-in and starts the session. */
export async function POST(request: Request): Promise<Response> {
  return loginVerifyResponse(request)
}
