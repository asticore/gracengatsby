/**
 * Custom collection endpoints (payload-removal-plan.md: Stage 7 tail).
 *
 * A collection's `endpoints: [{path, method, handler}]` config entry (this app
 * has two: `forms` -> `POST /:id/submit`, `form-submissions` -> `GET /export`)
 * used to be served only by real Payload's REST handler, reached through the
 * fall-through in `src/app/(engage)/api/[...slug]/route.ts`. This module owns
 * that dispatch so the fall-through can go away.
 *
 * The handler receives the incoming `Request` itself (so `req.headers`,
 * `req.url`, `req.json()`, `req.formData()` behave exactly as before) with
 * four extra own-properties, matching the subset of real Payload's
 * `PayloadRequest` that this app's endpoints use: `user`, `payload` (the
 * engine), `routeParams` and `query`.
 *
 * Matching mirrors real Payload: collection endpoints are checked BEFORE the
 * generic CRUD routes (otherwise `GET /form-submissions/export` would be read
 * as `findByID('export')`), path segments starting with `:` capture a param.
 *
 * No `payload` import - the endpoint shape is declared locally.
 */
import type { Engine } from './engine'
import { readRegistry } from './registry'

type EndpointLike = {
  path: string
  method: string
  handler: (req: never) => Promise<Response> | Response
}

const matchPath = (pattern: string, segments: string[]): Record<string, string> | null => {
  const parts = pattern.split('/').filter(Boolean)
  if (parts.length !== segments.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.startsWith(':')) {
      let value = segments[i]
      try {
        value = decodeURIComponent(value)
      } catch {
        // keep the raw segment
      }
      params[part.slice(1)] = value
    } else if (part !== segments[i]) {
      return null
    }
  }
  return params
}

/**
 * Returns the endpoint's `Response`, or `null` when no custom endpoint of the
 * named collection matches `method` + the remaining path.
 */
export async function handleCustomCollectionEndpoint(
  request: Request,
  slug: string[],
  engine: Engine,
): Promise<Response | null> {
  const collection = readRegistry.collections[slug[0]]
  if (!collection) return null
  const endpoints = (collection.config as unknown as { endpoints?: EndpointLike[] | false }).endpoints
  if (!Array.isArray(endpoints) || endpoints.length === 0) return null

  const method = request.method.toLowerCase()
  const rest = slug.slice(1)

  for (const endpoint of endpoints) {
    if (endpoint.method.toLowerCase() !== method) continue
    const routeParams = matchPath(endpoint.path, rest)
    if (!routeParams) continue

    const { user } = await engine.auth({ headers: request.headers })
    const url = new URL(request.url)
    const query: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      query[key] = value
    })
    const req = Object.assign(request, {
      user,
      payload: engine,
      routeParams: { collection: slug[0], ...routeParams },
      query,
    })
    try {
      return await (endpoint.handler as (r: typeof req) => Promise<Response> | Response)(req)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      return Response.json({ errors: [{ message }] }, { status: 500 })
    }
  }
  return null
}
