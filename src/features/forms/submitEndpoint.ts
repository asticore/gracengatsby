import type { Endpoint, EngineRequest } from '@/engine'

/**
 * POST /api/forms/:id/submit
 *
 * A collection endpoint rather than a route under src/app, so the whole feature
 * - schema, logic and its public surface - lives in one folder and arrives or
 * leaves in one piece. The same handler also backs the public Next route
 * (src/app/(engage)/api/forms/[id]/submit/route.ts), which exists so the
 * endpoint can answer CORS preflights for forms embedded on other websites.
 *
 * `:id` is the numeric id or the form's public embed key. Everything - origin
 * allow-list, rate limit, spam checks, validation, file uploads - lives in
 * submitRequest.ts and submit.ts.
 */
export const submitEndpoint: Endpoint = {
  path: '/:id/submit',
  method: 'post',
  handler: async (req: EngineRequest): Promise<Response> => {
    const idOrKey = (req.routeParams?.id ?? '') as string

    // Deferred so the collection config - which carries this endpoint - does
    // not statically depend on the submission pipeline. See settings.ts.
    const { handleSubmitRequest } = await import('./submitRequest')
    return handleSubmitRequest(req as unknown as Request, req.engine as never, idOrKey)
  },
}
