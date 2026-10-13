import { getEngine } from '@/engine'
import { handleDraftRequest } from '@/features/forms/draftRequest'

export const dynamic = 'force-dynamic'

/**
 * POST /api/form-draft - save and continue. Body { form, email, data, page, pageUrl? } saves a draft and
 * emails a resume link; body { form, token } returns the saved answers. OPTIONS is the CORS preflight
 * (?form=<id or key>). The rules, limits and the allow-list are in features/forms/draftRequest.ts.
 */
export async function POST(request: Request): Promise<Response> {
  const engine = await getEngine()
  return handleDraftRequest(request, engine as never)
}

export async function OPTIONS(request: Request): Promise<Response> {
  const engine = await getEngine()
  return handleDraftRequest(request, engine as never)
}
