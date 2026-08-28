import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'

import { DISABLED_SPEED, resolveSpeed, type ResolvedSpeed } from './types'

/**
 * Reads the Speed global and the feature flags together.
 *
 * Never throws. A speed feature that takes the site down on a settings read
 * failure is worse than a slow site, so every failure path returns
 * DISABLED_SPEED and the page renders exactly as it did before this feature
 * existed.
 */
export const getSpeedSettings = async (): Promise<ResolvedSpeed> => {
  try {
    const flags = await getFeatureFlags()
    if (!flags.speed) return DISABLED_SPEED

    const engine = await getEngine()
    const settings = await engine.findGlobal({ slug: 'speed-settings', depth: 0 }).catch((): null => null)
    return resolveSpeed(settings, true)
  } catch {
    return DISABLED_SPEED
  }
}
