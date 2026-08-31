/**
 * Slugs, table names and the cookie name live here on their own so the
 * collection, the runtime, the results screen and the migration all read the
 * same strings. The migration writes raw SQL against these tables, so a rename
 * that only touched the collection file would silently split the schema in two.
 */

export const AB_TESTS_SLUG = 'ab-tests'

export const AB_TESTS_TABLE = 'eg_ab_tests'
export const AB_TESTS_VARIANTS_TABLE = 'eg_ab_tests_variants'
export const AB_TESTS_GOALS_TABLE = 'eg_ab_tests_goals'

/** Append-only log: one row per new visitor per test, one per first conversion. */
export const AB_EVENTS_TABLE = 'eg_ab_events'

/** Pre-aggregated counters, so the results screen never scans the log. */
export const AB_STATS_TABLE = 'eg_ab_stats'

export const AB_TESTING_FEATURE_KEY = 'abTesting' as const

/** Signed, HttpOnly. Holds the visitor id, their assignments and what they have converted on. */
export const AB_COOKIE = 'eg_ab'

/** A year. Long enough that a test running for a quarter never loses its cohort. */
export const AB_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Query parameter the edge cache key is varied on. It never reaches an origin
 * fetch or a rendered URL - it exists only to make one cache entry per variant.
 */
export const AB_CACHE_PARAM = '__abv'

/** Where the browser posts click and page-visit goals. See handleTrackRequest. */
export const AB_TRACK_PATH = '/api/ab-track'
