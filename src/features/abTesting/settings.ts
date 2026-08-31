import { FEATURE_MAP } from '@/features/registry'

import { AB_TESTING_FEATURE_KEY } from './slugs'

/**
 * The engine is passed in rather than imported, for the same reason the Members
 * feature does it: the config imports this feature's collection, so importing
 * '@/lib/engine' here would make the config depend on itself and the collection
 * would come back undefined at boot.
 */
export type EngineLike = {
  findGlobal(args: { slug: string; depth?: number }): Promise<unknown>
}

/**
 * True when A/B testing is switched on in Site Settings.
 *
 * Fails closed. An unreadable settings global means "off", which renders the
 * original content to everybody - the one outcome that is never wrong, only
 * uninformative.
 */
export const abTestingEnabled = async (engine: EngineLike): Promise<boolean> => {
  const fallback = FEATURE_MAP[AB_TESTING_FEATURE_KEY]?.defaultEnabled ?? false
  const settings = (await engine
    .findGlobal({ slug: 'site-settings', depth: 0 })
    .catch((): null => null)) as { features?: Record<string, boolean | null> } | null
  if (!settings) return false
  return Boolean(settings.features?.[AB_TESTING_FEATURE_KEY] ?? fallback)
}

/** The signing secret for the visitor cookie, taken from the same place the engine's is. */
export const abSecret = (): string => process.env.ENGAGE_SECRET || process.env.PAYLOAD_SECRET || ''
