import { registerOptionsResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/register-options: creation options for the signed-in person. */
export async function POST(request: Request): Promise<Response> {
  return registerOptionsResponse(request)
}
