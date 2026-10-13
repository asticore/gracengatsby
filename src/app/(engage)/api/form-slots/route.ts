import { getEngine } from '@/engine'
import { handleSlotsRequest } from '@/features/forms/slotsEndpoint'

export const dynamic = 'force-dynamic'

/**
 * GET /api/form-slots - the start times already full for one appointment field
 * on one day. Public, read-only, and answers only with the times themselves.
 */
export async function GET(request: Request): Promise<Response> {
  const engine = await getEngine()
  return handleSlotsRequest(request, engine as never)
}
