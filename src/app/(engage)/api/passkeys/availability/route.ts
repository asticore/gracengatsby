import { availabilityResponse } from '@/features/accounts/passkeysHttp'

export const dynamic = 'force-dynamic'

/** GET /api/passkeys/availability?area=account|admin: whether passkey sign-in is offered on that screen. */
export async function GET(request: Request): Promise<Response> {
  return availabilityResponse(request)
}
