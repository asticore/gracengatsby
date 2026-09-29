/**
 * GraphQL endpoint (payload-removal-plan.md: Stage 7). Fully Payload-free.
 *
 * `handleEcommerceGraphQL` (`@/localapi/graphql`) serves the 5 ecommerce
 * collections' own Query/Mutation fields using the `graphql` package only.
 * It returns `null` for anything else (other collections/globals,
 * introspection, malformed or mixed queries). Real Payload's GraphQL used to
 * be the fallthrough, but that schema crashed at build time
 * (`Schema must contain uniquely named types but contains multiple types
 * named "Faq"`) and this app has no GraphQL consumers outside the ecommerce
 * collections, so unhandled operations now get an explicit 501. Use REST
 * (`/api/[...slug]`) for those.
 */
import { handleEcommerceGraphQL } from '@/localapi/graphql'

export async function POST(request: Request): Promise<Response> {
  const ours = await handleEcommerceGraphQL(request)
  if (ours) return ours
  return Response.json(
    {
      errors: [
        {
          message:
            'GraphQL is only supported for the ecommerce collections (products, orders, carts, transactions, addresses). Use the REST API for other collections and globals.',
          extensions: { code: 'NOT_IMPLEMENTED' },
        },
      ],
    },
    { status: 501 },
  )
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } })
}
