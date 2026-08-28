import { cache } from 'react'

import type { MediaConfig } from './types'

import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { resolveMediaConfig } from './config'
import { DISABLED_CONFIG } from './url'

/**
 * Per-request memoised: a page with twenty images would otherwise read the same
 * global twenty times.
 */
export const getMediaConfig = cache(async (): Promise<MediaConfig> => {
  try {
    const flags = await getFeatureFlags()
    if (!flags.media) return DISABLED_CONFIG

    const engine = await getEngine()
    const settings = await engine.findGlobal({ slug: 'media-settings', depth: 0 }).catch((): null => null)

    return resolveMediaConfig(settings, true)
  } catch {
    return DISABLED_CONFIG
  }
})
