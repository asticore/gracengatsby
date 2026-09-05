/**
 * Engine seam: the HTTP route handlers mounted under /api.
 *
 * REST_* back the content API at /api/[...slug]; GRAPHQL_* back /api/graphql
 * and its playground. Both sets are kept - GraphQL stays mounted even though
 * it is not guaranteed to run on Workers (upstream workerd #5175), so the
 * route survives for whenever that lands.
 *
 * Replacing these means owning request parsing, querying, depth/population
 * and serialisation - so this comes after the data and field layers, not
 * before.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 */

export {
  GRAPHQL_PLAYGROUND_GET,
  GRAPHQL_POST,
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'
