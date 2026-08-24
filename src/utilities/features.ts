import { getEngine } from '@/lib/engine'
import { DEFAULT_FLAGS, FEATURES, type FeatureFlags, type FeatureKey } from '@/features/registry'

export type { FeatureFlags, FeatureKey }

/**
 * Reads the current feature flags from Site Settings, falling back to each
 * feature's registry default when the global is unreadable or a flag has never
 * been set. Deliberately never throws: a failure to read settings should
 * degrade to defaults, not take the whole site down.
 */
export const getFeatureFlags = async (): Promise<FeatureFlags> => {
  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)
  const saved = (settings?.features ?? {}) as Partial<Record<FeatureKey, boolean | null | undefined>>

  const flags = { ...DEFAULT_FLAGS }
  for (const feature of FEATURES) {
    flags[feature.key] = saved[feature.key] ?? feature.defaultEnabled
  }
  return flags
}
