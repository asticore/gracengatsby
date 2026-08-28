/**
 * Public surface of the Speed feature.
 *
 * Three things are meant to be wired into the app: <SpeedHead /> in the public
 * layout's head, applySpeedHeaders() in the middleware, and purgeCache() from
 * content-change hooks. Everything else exported here supports those.
 *
 * Every entry point is a no-op when the Speed feature flag is off, so wiring
 * them in is safe on an install that never turns the feature on.
 */
export { SpeedHead, default as SpeedHeadComponent } from './SpeedHead'
export { applySpeedHeaders } from './headers'
export { purgeCache, openEdgeCache, type PurgeResult } from './purge'
export { withPageCache } from './pageCache'
export { getSpeedSettings } from './settings'
export { resolveSpeed, DISABLED_SPEED, type ResolvedSpeed, type SpeedSettingsInput } from './types'
