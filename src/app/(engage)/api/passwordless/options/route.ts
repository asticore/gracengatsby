import { optionsResponse } from '@/features/accounts/passwordlessHttp'

export const dynamic = 'force-dynamic'

/** GET /api/passwordless/options?area=account|admin: which emailed options to show. Switches only, never secrets. */
export async function GET(request: Request): Promise<Response> {
  return optionsResponse(request)
}
