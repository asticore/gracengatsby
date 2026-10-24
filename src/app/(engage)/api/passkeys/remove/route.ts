import { removeResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/remove: removes one of the signed-in person's passkeys. */
export async function POST(request: Request): Promise<Response> {
  return removeResponse(request)
}
