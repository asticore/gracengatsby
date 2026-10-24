import { loginOptionsResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/login-options: options for a passkey sign-in. */
export async function POST(request: Request): Promise<Response> {
  return loginOptionsResponse(request)
}
