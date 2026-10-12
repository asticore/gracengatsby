import { getEngine } from '@/engine'
import { handleSubmitRequest } from '@/features/forms/submitRequest'

export const dynamic = 'force-dynamic'

/**
 * POST /api/forms/:id-or-key/submit and its CORS preflight.
 *
 * Public on purpose: this is how a visitor (or an embedded copy of the form on
 * another website) sends an entry. The allow-list, rate limit, spam checks and
 * validation all happen in handleSubmitRequest. A more specific route than the
 * engine's catch-all, so the engine's own copy of this endpoint is only
 * reached by internal callers.
 */
type Context = { params: Promise<{ id: string }> }

const handle = async (request: Request, context: Context): Promise<Response> => {
  const { id } = await context.params
  const engine = await getEngine()
  return handleSubmitRequest(request, engine as never, id)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return handle(request, context)
}

export async function OPTIONS(request: Request, context: Context): Promise<Response> {
  return handle(request, context)
}
