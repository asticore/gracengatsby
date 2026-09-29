/**
 * Engine seam: the HTTP route handlers mounted under /api.
 *
 * REST_* back the content API at /api/[...slug]. /api/graphql is now a
 * hand-written, Payload-free route (see src/app/(engage)/api/graphql/route.ts).
 *
 * Replacing these means owning request parsing, querying, depth/population
 * and serialisation - so this comes after the data and field layers, not
 * before.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 */

export {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'
