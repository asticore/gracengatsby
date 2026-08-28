/**
 * The shared guard on the four internal maintenance routes.
 *
 * These endpoints exist because this project's CLI cannot reach production D1
 * from CI (see the note on the binding in wrangler.jsonc), so schema work,
 * seeding, media re-optimisation and the email test all run through the
 * deployed Worker instead.
 *
 * The key used to be a literal committed in each route file, which meant
 * anyone reading the source could POST to them unauthenticated. None of them
 * destroy data - migrate is additive, seed checks before writing - but each
 * runs unbounded D1 work per request, which is a cheap way to run up a bill or
 * hold the database busy. It now comes from the environment.
 *
 * `INTERNAL_ROUTE_KEY` is the name; the old value is accepted as a fallback so
 * a deploy that has not had the secret set yet still migrates rather than
 * silently skipping and leaving the schema behind. Set the secret and the
 * fallback stops applying.
 */

const HEADER = 'x-seed-key'

/** Retired default. Only used when no key is configured - see the note above. */
const LEGACY_FALLBACK = 'gracengatsby-seed'

const configuredKey = (): string => process.env.INTERNAL_ROUTE_KEY || LEGACY_FALLBACK

/**
 * Compares in constant time. The keys are short and an attacker can only guess
 * over the network, so this is belt and braces rather than load-bearing - but
 * it costs nothing and removes the question.
 */
const matches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < given.length; index++) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

/** True when the request carries the right key. */
export const hasInternalRouteKey = (request: Request): boolean => {
  const given = request.headers.get(HEADER)
  if (!given) return false
  return matches(given, configuredKey())
}

/** True when the deploy is still relying on the retired default. */
export const usingLegacyKey = (): boolean => !process.env.INTERNAL_ROUTE_KEY
