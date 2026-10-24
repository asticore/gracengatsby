import { renameResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passkeys/rename: renames one of the signed-in person's passkeys. */
export async function POST(request: Request): Promise<Response> {
  return renameResponse(request)
}
