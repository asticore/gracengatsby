import { SpeedSettings } from '@/globals/SpeedSettings'

import { createGlobalOps } from '../generic'
import { speedSettings, speedSettingsAdvancedPreconnectOrigins, speedSettingsAdvancedPrefetchDns, speedSettingsGroupFields } from '../schema'

/**
 * Payload's document shape for the `speed-settings` global - see
 * src/globals/SpeedSettings.ts. `caching`/`assets`/`media`/`fonts` are plain
 * `group` fields (scalars only) - flattened onto the table with a column
 * prefix by generateTable() alone, same mechanism SiteSettings' `theme`/`seo`
 * already proved, reconstructed here purely by passing
 * `speedSettingsGroupFields` into createGlobalOps.
 *
 * `advanced` is Phase 20's Gap A1, twice over: its `preconnectOrigins`/
 * `prefetchDns` fields are `array` fields living INSIDE a TOP-LEVEL group.
 * ../schema/index.ts's `wireTopLevelGroupFields` builds
 * `speedSettingsAdvancedPreconnectOrigins`/`speedSettingsAdvancedPrefetchDns`
 * from generate.ts's own `topLevelGroupFields` output, keyed here by the
 * synthetic `advancedPreconnectOrigins`/`advancedPrefetchDns` keys (matching
 * `speedSettingsGroupFields`'s `advanced` entry's
 * `arrayFieldNames: ['preconnectOrigins', 'prefetchDns']`, computed by
 * generate.ts, not hand-patched) so both read (nestGroups' `extractGroup`)
 * and write (../generic.ts's collectGroupSpecialFields-driven lift inside
 * `splitSpecialFields`) fold them into `advanced.*` automatically - no
 * per-file reshaping needed.
 */
export type SpeedSettingsDoc = {
  id: number
  caching?: {
    pageCache?: boolean | null
    cacheTtlSeconds?: number | null
    cacheLoggedInUsers?: boolean | null
    purgeOnPublish?: boolean | null
  } | null
  assets?: {
    minifyCss?: boolean | null
    minifyJs?: boolean | null
    combineCss?: boolean | null
    deferJs?: boolean | null
    removeUnusedCss?: boolean | null
    preloadCriticalCss?: boolean | null
  } | null
  media?: {
    lazyLoadImages?: boolean | null
    lazyLoadIframes?: boolean | null
    addImageDimensions?: boolean | null
    disableEmojiScript?: boolean | null
  } | null
  fonts?: {
    preloadFonts?: boolean | null
    fontDisplaySwap?: boolean | null
  } | null
  advanced?: {
    preconnectOrigins?: { id: string; url?: string | null }[] | null
    prefetchDns?: { id: string; domain?: string | null }[] | null
    delayJsExecution?: boolean | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  speedSettings,
  SpeedSettings,
  { advancedPreconnectOrigins: speedSettingsAdvancedPreconnectOrigins, advancedPrefetchDns: speedSettingsAdvancedPrefetchDns },
  { groupFields: speedSettingsGroupFields },
)

export const findSpeedSettings = ops.find as unknown as () => Promise<SpeedSettingsDoc | null>
export const updateSpeedSettings = ops.update as unknown as (
  data: Partial<Omit<SpeedSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SpeedSettingsDoc>
