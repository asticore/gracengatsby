/**
 * Which links the hover-prefetch script is allowed to fetch in the background.
 *
 * The rules live as a small piece of browser JavaScript, not as TypeScript, because
 * they run inside the page. Keeping them as one source string means the spec in
 * tests/int exercises exactly the code the browser gets, rather than a copy that
 * could drift from it.
 *
 * The expression evaluates to { eligible, connectionOk }.
 */

/** How long the pointer must rest on a link before it is fetched. Short enough to be cheap, long enough to skip a pass-over. */
export const PREFETCH_HOVER_DELAY_MS = 65

/** Most links fetched per page view. Stops a long menu from fetching thirty pages. */
export const PREFETCH_MAX_PER_PAGE = 20

/** Paths that are never prefetched: the admin, the API, and anything holding a visitor's basket or payment. */
export const PREFETCH_EXCLUDED_PATHS: readonly string[] = ['/admin', '/api', '/cart', '/checkout']

export const PREFETCH_RULES_SOURCE = `(function () {
  function eligible(a, here, excluded) {
    if (!a || !a.href) return false
    if (a.download) return false
    if (a.target && a.target !== '_self') return false
    var target
    var base
    try {
      target = new URL(a.href, here)
      base = new URL(here)
    } catch (e) {
      return false
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return false
    if (target.origin !== base.origin) return false
    var path = target.pathname
    for (var i = 0; i < excluded.length; i++) {
      var prefix = excluded[i]
      if (path === prefix || path.indexOf(prefix + '/') === 0) return false
    }
    if (path === base.pathname && target.search === base.search) return false
    return true
  }
  function connectionOk(conn) {
    if (!conn) return true
    if (conn.saveData) return false
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false
    return true
  }
  return { eligible: eligible, connectionOk: connectionOk }
})()`
