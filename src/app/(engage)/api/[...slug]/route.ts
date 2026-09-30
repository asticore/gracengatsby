/**
 * REST API route (the plan doc: Stage 7). Fully vendor-free.
 *
 * `handleCustomCollectionEndpoint` (`@/localapi/endpoints`) runs a
 * collection's own config `endpoints` first; then `handleRestRequest`
 * (`@/localapi/rest`) serves every collection/global route, auth, versions,
 * access, duplicate, bulk update/delete and the Stripe payment routes. It returns `null` for anything it does not recognise; that used to
 * fall through to the reference engine's REST handler and now gets the same 404 body
 * the reference engine sent for an unknown route (`Route not found "<pathname>"`).
 *
 * The reference engine's core routes this app never used and does not implement:
 * `POST /users/verify/:token`, `/users/init`, `/users/first-register`,
 * `GET /:media/paste-url`, `GET /engine-jobs/run`. `PUT` has no core routes
 * at all. `OPTIONS` answers `200 {}` like the reference engine does with no `cors`
 * config (this app declares none).
 */
import { createEngine } from '@/localapi/engine'
import { handleCustomCollectionEndpoint } from '@/localapi/endpoints'
import { handleRestRequest } from '@/localapi/rest'

type RouteArgs = { params: Promise<{ slug: string[] }> }

const notFound = (request: Request): Response =>
  Response.json({ message: `Route not found "${new URL(request.url).pathname}"` }, { status: 404 })

const dispatch = async (request: Request, args: RouteArgs): Promise<Response> => {
  const { slug } = await args.params
  const engine = createEngine()
  // Custom collection `endpoints` go first, like the reference engine: otherwise `GET /form-submissions/export` would be read as findByID('export').
  const response =
    (await handleCustomCollectionEndpoint(request, slug, engine)) ?? (await handleRestRequest(request, slug, engine))
  return response ?? notFound(request)
}

export const GET = dispatch
export const POST = dispatch
export const PATCH = dispatch
export const DELETE = dispatch
export const PUT = (request: Request): Response => notFound(request)
export const OPTIONS = (): Response => Response.json({}, { status: 200 })
