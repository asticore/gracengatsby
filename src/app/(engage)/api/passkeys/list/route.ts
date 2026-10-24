import { listResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** GET /api/passkeys/list: the signed-in person's passkeys. */
export async function GET(request: Request): Promise<Response> {
  return listResponse(request)
}
