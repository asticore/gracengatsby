import { registerVerifyResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/register-verify: checks the new credential and stores its public key. */
export async function POST(request: Request): Promise<Response> {
  return registerVerifyResponse(request)
}
