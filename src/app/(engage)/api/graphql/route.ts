/**
 * GraphQL hybrid dispatcher (payload-removal-plan.md: "GraphQL types for the
 * 5 ecommerce collections"). This file used to be Payload-generated
 * scaffolding (a header comment here used to say "DO NOT MODIFY - COULD BE
 * REWRITTEN AT ANY TIME"), same claim already checked and found false for
 * the REST equivalent (`src/app/(engage)/api/[...slug]/route.ts` - see that
 * file's own header): no installed CLI step regenerates this file either, so
 * it is dead scaffolding boilerplate, safe to hand-maintain permanently.
 *
 * `handleEcommerceGraphQL` (`@/localapi/graphql`) is tried FIRST. It returns
 * a real `Response` for any operation that touches only the 5 ecommerce
 * collections' own known Query/Mutation fields, or `null` to mean "not
 * handled here" for anything else (the other 21 collections + 17 globals'
 * full real-Payload-generated schema, introspection, malformed queries, or a
 * mixed query touching both) - in every fallthrough case it reads the
 * request body via `request.clone()` first, so handing the same,
 * still-unconsumed `Request` to real Payload's own handler next is safe. See
 * `@/localapi/graphql`'s own header for the full rationale and the
 * deliberate simplifications this hybrid schema makes vs real Payload's
 * fully-typed one.
 */
import config from '@engage-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@/engine/next/routes'

import { handleEcommerceGraphQL } from '@/localapi/graphql'

const realPost = GRAPHQL_POST(config)

export async function POST(request: Request): Promise<Response> {
  const ours = await handleEcommerceGraphQL(request)
  if (ours) return ours
  return realPost(request)
}

export const OPTIONS = REST_OPTIONS(config)