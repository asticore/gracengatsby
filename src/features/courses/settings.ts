import type { Payload } from '@/engine'

import { DEFAULT_FLAGS, FEATURES, type FeatureFlags, type FeatureKey } from '@/features/registry'

/**
 * The same answer `getFeatureFlags` gives, read through an engine instance we
 * already hold.
 *
 * The shared helper reaches for `getEngine`, which imports the root config -
 * and the root config imports these collections. Inside a collection's access
 * function that is a cycle, so the flags are read from the engine instance the
 * request already carries instead.
 * Never throws: an unreadable settings global degrades to the registry
 * defaults, and `lms` defaults to off.
 */
export const flagsFrom = async (engine: Payload): Promise<FeatureFlags> => {
  const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)
  const saved = (settings?.features ?? {}) as Partial<Record<FeatureKey, boolean | null | undefined>>

  const flags = { ...DEFAULT_FLAGS }
  for (const feature of FEATURES) {
    flags[feature.key] = saved[feature.key] ?? feature.defaultEnabled
  }
  return flags
}
