/**
 * REST + GraphQL API removal (Stage 7): the hybrid dispatcher.
 *
 * This file used to be Payload-generated scaffolding (a header comment here
 * used to say "DO NOT MODIFY - COULD BE REWRITTEN AT ANY TIME"). That claim
 * was checked directly against `node_modules/@payloadcms/next`'s dist output
 * during Stage 7's scoping work: no installed CLI step (`generate:importmap`,
 * `generate:types`, build, etc.) regenerates this file, so it is dead
 * scaffolding boilerplate, not something any tool rewrites - safe to
 * hand-maintain permanently. See payload-removal-plan.md's "REST + GraphQL
 * API removal (Stage 7)" section for the full scoping decision and the
 * build-prove-flip history behind this wiring (sub-steps 1-3b).
 *
 * `handleRestRequest` (`@/localapi/rest`) is tried FIRST for GET/POST/PATCH/
 * DELETE. It returns a real `Response` for anything in this stage's scope
 * (core collection/global CRUD + core auth - see the plan doc), or `null` to
 * mean "not handled here" for anything still deferred (bulk operations,
 * versions/drafts, duplicate, `/access`, locked-documents/preferences,
 * GraphQL, or any collection/global it doesn't recognize) - in every one of
 * those fallthrough cases `handleRestRequest` returns before ever reading the
 * request body, so handing the same, still-unconsumed `Request` object to
 * real Payload's own handler next is safe. `PUT`/`OPTIONS` have no
 * from-scratch implementation and always go straight to real Payload.
 */
import config from '@engage-config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@/engine/next/routes'

import { handleRestRequest } from '@/localapi/rest'

const realGet = REST_GET(config)
const realPost = REST_POST(config)
const realDelete = REST_DELETE(config)
const realPatch = REST_PATCH(config)

type RouteArgs = Parameters<typeof realGet>[1]

export async function GET(request: Request, args: RouteArgs): Promise<Response> {
  const { slug } = await args.params
  const ours = await handleRestRequest(request, slug)
  if (ours) return ours
  return realGet(request, args)
}

export async function POST(request: Request, args: RouteArgs): Promise<Response> {
  const { slug } = await args.params
  const ours = await handleRestRequest(request, slug)
  if (ours) return ours
  return realPost(request, args)
}

export async function PATCH(request: Request, args: RouteArgs): Promise<Response> {
  const { slug } = await args.params
  const ours = await handleRestRequest(request, slug)
  if (ours) return ours
  return realPatch(request, args)
}

export async function DELETE(request: Request, args: RouteArgs): Promise<Response> {
  const { slug } = await args.params
  const ours = await handleRestRequest(request, slug)
  if (ours) return ours
  return realDelete(request, args)
}

export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
