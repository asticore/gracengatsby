import { requestResponse } from '@/features/accounts/passwordlessHttp'

export const dynamic = 'force-dynamic'

/** POST /api/passwordless/request: asks for an emailed link or code. Same answer for any address. */
export async function POST(request: Request): Promise<Response> {
  return requestResponse(request)
}
