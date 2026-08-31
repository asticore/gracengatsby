import { variantFingerprint } from './runtime'
import { AB_CACHE_PARAM } from './slugs'
import type { AbContext } from './types'

/**
 * How split testing and edge page caching coexist.
 *
 * The conflict is real and total: the Speed feature stores one rendered copy
 * of a page at the edge, keyed on `origin + pathname + search`, and serves it
 * to everybody. A test that swaps content on that page would show whichever
 * variant happened to be rendered first to every visitor for a whole TTL, and
 * the impression counts would say the split was even. That is not a degraded
 * test; it is a fabricated one.
 *
 * Two ways out, and this feature takes the second:
 *
 *   1. Exclude tested pages from the cache. Simple, and wrong in practice: you
 *      run tests on the pages that matter most - the homepage, a landing page,
 *      a product page - so the rule would remove caching from exactly the
 *      traffic it was bought for, and it would do so for the entire duration of
 *      the test. It also makes "is this page cached?" depend on an editor's
 *      unrelated decision to start a test.
 *
 *   2. Vary the cache key on the assigned variant. One cached copy per arm -
 *      two or three, the same cardinality as the test - instead of one. Every
 *      visitor still gets a cache hit; the hit rate falls by the miss cost of a
 *      couple of extra entries, not by the whole page.
 *
 * The key is varied on the *assignment*, not on the cookie. Every visitor's
 * cookie is unique, so keying on it would give one cache entry per person,
 * which is worse than no cache at all. `variantFingerprint` collapses that to a
 * short ordered string built only from tests targeting THIS path - so a page
 * with no test on it produces an empty fingerprint, the request is passed
 * through untouched, and it keeps its single cache entry exactly as before.
 *
 * The fingerprint travels as a query parameter because that is the one part of
 * the key `withPageCache` builds that a caller can influence without editing
 * the Speed feature. It is used solely to construct the cache key: the request
 * the page is actually rendered from is the original one, so the parameter
 * never reaches a page component, a canonical URL or an analytics hit.
 *
 * `applySpeedHeaders` already sets `Vary: Cookie` on cacheable responses, which
 * is what keeps a shared cache in front of the Worker - a browser cache, a
 * corporate proxy - from making the same mistake one layer up.
 */

/** The request whose URL should be used as the cache key. */
export const abCacheKeyRequest = (request: Request, context: AbContext): Request => {
  const fingerprint = variantFingerprint(context)
  if (!fingerprint) return request
  const url = new URL(request.url)
  url.searchParams.set(AB_CACHE_PARAM, fingerprint)
  return new Request(url.toString(), request)
}

type PageCache = (request: Request, build: () => Promise<Response>) => Promise<Response>

/**
 * Wraps the Speed feature's page cache so it keys on the variant.
 *
 * `withPageCache` is passed in rather than imported so this file has no
 * dependency on the Speed feature at all - if Speed is not wired up, this is
 * never called, and if it is, the two features meet at one call site instead of
 * reaching into each other.
 */
export const withVariantAwarePageCache = (
  withPageCache: PageCache,
  request: Request,
  context: AbContext,
  build: () => Promise<Response>,
): Promise<Response> => withPageCache(abCacheKeyRequest(request, context), build)
