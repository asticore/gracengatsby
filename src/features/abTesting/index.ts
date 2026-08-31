/**
 * Public surface of the A/B testing feature.
 *
 * Everything outside this folder imports from here: the config takes the
 * collection and the results view, the page render path takes resolveAbContext
 * / applyVariants / ABTracker, the cache wrapper takes abCacheKeyRequest, and
 * the track route takes handleTrackRequest.
 *
 * The feature flag is honoured in exactly one place - the manifest, which
 * returns no tests while it is off. Every path downstream of that then falls
 * through to the original content on its own, so there is no second switch to
 * forget and no way for half of the feature to stay live.
 */

export { ABTests } from './collections/ABTests'

export { ABResultsView } from './components/ABResultsView'
export { ABTracker } from './components/ABTracker'

export {
  AB_COOKIE,
  AB_EVENTS_TABLE,
  AB_STATS_TABLE,
  AB_TESTS_SLUG,
  AB_TESTS_TABLE,
  AB_TESTING_FEATURE_KEY,
  AB_TRACK_PATH,
} from './slugs'

export type {
  AbContext,
  ActiveTest,
  GoalResult,
  GoalSpec,
  GoalType,
  ReadinessLevel,
  TestScope,
  TestStatus,
  VariantResult,
  VariantSpec,
  VisitorState,
} from './types'

export { assignVariant, bucketOf, newVisitorId, pickVariant } from './assign'
export { decodeVisitor, encodeVisitor, emptyVisitor, readVisitorCookie } from './cookie'

export { abTestingEnabled, abSecret, type EngineLike } from './settings'
export { getTestManifest, clearTestManifest, toActiveTest } from './manifest'

export {
  DISABLED_CONTEXT,
  abCookieHeader,
  recordConversion,
  resolveAbContext,
  testsForPath,
  variantFingerprint,
} from './runtime'

export { abCacheKeyRequest, withVariantAwarePageCache } from './cache'

export {
  applyTrigger,
  goalMatches,
  handleTrackRequest,
  recordOrderConversion,
  type Trigger,
} from './conversions'

export { applyVariants, type BlockLike, type VariantApplication } from './render'

export { buildResults, resultsForTest, revenueByVariant } from './results'
export { recordConversionEvent, recordImpression, readStats, type StatRow } from './events'

export {
  MIN_VISITORS_PER_ARM,
  proportionZ,
  sampleNeededPerArm,
  twoSidedP,
  wilsonInterval,
} from './stats'
