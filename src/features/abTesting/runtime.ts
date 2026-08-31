import { getCloudflareContext } from '@opennextjs/cloudflare'

import { assignVariant } from './assign'
import { recordConversionEvent, recordImpression } from './events'
import { getTestManifest } from './manifest'
import { decodeVisitor, emptyVisitor, readVisitorCookie, visitorCookieHeader } from './cookie'
import { abSecret, type EngineLike } from './settings'
import type { AbContext, ActiveTest, VisitorState } from './types'

/**
 * The request-path entry point: work out which variant this visitor is in,
 * for every test that applies to the page being served.
 *
 * The expensive-looking part - reading the tests - is served from the
 * in-isolate manifest, and the decision itself is a hash. So a repeat visitor
 * to a tested page costs one HMAC verify and no query at all; the only
 * database write in the whole flow happens once per visitor per test.
 */

type Engine = EngineLike & {
  find(args: {
    collection: string
    where?: unknown
    depth?: number
    limit?: number
    overrideAccess?: boolean
  }): Promise<{ docs: unknown[] }>
}

/** Runs work after the response is sent where the platform allows it. */
const after = (work: Promise<unknown>): void => {
  void getCloudflareContext({ async: true })
    .then(({ ctx }) => {
      const waitUntil = (ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined)?.waitUntil
      if (waitUntil) waitUntil(work)
      else void work
    })
    .catch(() => {
      void work
    })
}

const normalisePath = (path: string): string => {
  const trimmed = path.split('?')[0].replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** The tests that target the page at this path. */
export const testsForPath = (tests: ActiveTest[], pathname: string): ActiveTest[] => {
  const wanted = normalisePath(pathname)
  return tests.filter((test) => test.targetPath && normalisePath(test.targetPath) === wanted)
}

export const DISABLED_CONTEXT: AbContext = {
  enabled: false,
  visitor: { v: 1, id: '', a: {}, c: {} },
  tests: [],
  allTests: [],
  assignments: {},
  changed: false,
}

/**
 * Builds the context for one request.
 *
 * When the feature is off the manifest is empty, so this returns no
 * assignments and every caller falls through to the original content. That is
 * the only place the flag needs checking: there is no second switch to forget.
 */
export const resolveAbContext = async (
  engine: Engine,
  request: { headers: { get: (name: string) => string | null }; url: string },
): Promise<AbContext> => {
  const secret = abSecret()
  if (!secret) return DISABLED_CONTEXT

  const tests = await getTestManifest(engine)
  const pathname = new URL(request.url).pathname
  const applicable = testsForPath(tests, pathname)

  const existing = await decodeVisitor(readVisitorCookie(request.headers.get('cookie')), secret)

  // No test on this page and no cookie yet: nothing to decide and nothing worth
  // writing a cookie for. A visitor who never lands on a tested page never gets
  // one at all.
  if (applicable.length === 0 && !existing) {
    return { ...DISABLED_CONTEXT, enabled: true, allTests: tests }
  }

  const visitor: VisitorState = existing ?? emptyVisitor()

  // Seeded with everything the cookie already carries, because a conversion on
  // this page may belong to a test that runs on a different one.
  const assignments: Record<string, string> = { ...visitor.a }
  let changed = existing === null

  for (const test of applicable) {
    const known = visitor.a[test.id]
    // An arm that has since been deleted must not keep being served, but the
    // visitor is re-bucketed rather than dropped so they stay in the test.
    const stillValid = known && test.variants.some((variant) => variant.key === known)

    if (stillValid) continue

    const picked = assignVariant(visitor.id, test.id, test.variants)
    if (!picked) continue

    assignments[test.id] = picked
    visitor.a[test.id] = picked
    changed = true

    // First sight of this visitor in this test: the one impression write.
    after(recordImpression(test.id, picked, visitor.id))
  }

  return { enabled: true, visitor, tests: applicable, allTests: tests, assignments, changed }
}

/** The Set-Cookie header to attach, or null when nothing changed. */
export const abCookieHeader = async (
  context: AbContext,
  request: { url: string },
): Promise<string | null> => {
  if (!context.enabled || !context.changed) return null
  const secret = abSecret()
  if (!secret) return null
  return visitorCookieHeader(context.visitor, secret, new URL(request.url).protocol === 'https:')
}

/**
 * A fingerprint of the assignments that affect what this URL renders.
 *
 * Empty string for a page with no test on it, which is the whole point: an
 * untested page keeps exactly one cache entry. A tested page gets one entry per
 * variant - the same cardinality as the test itself - keyed on a short,
 * ordered string rather than on the raw cookie, so two visitors in the same arm
 * share a cached copy even though their cookies differ.
 */
export const variantFingerprint = (context: AbContext): string =>
  context.tests
    .map((test) => test.id)
    .sort()
    .filter((testId) => context.assignments[testId])
    .map((testId) => `${testId}.${context.assignments[testId]}`)
    .join('~')

/**
 * Records a conversion, once per visitor per goal.
 *
 * Returns false when nothing was written - unknown test, visitor not in the
 * test, or they have already converted on it. Callers use that to avoid
 * logging a "conversion recorded" they did not get.
 */
export const recordConversion = async (
  context: AbContext,
  testId: string,
  goalKey: string,
  value = 0,
): Promise<boolean> => {
  if (!context.enabled) return false
  const variant = context.assignments[testId]
  if (!variant) return false

  const dedupeKey = `${testId}:${goalKey}`
  if (context.visitor.c[dedupeKey]) return false

  context.visitor.c[dedupeKey] = 1
  context.changed = true
  after(recordConversionEvent(testId, variant, goalKey, context.visitor.id, value))
  return true
}
