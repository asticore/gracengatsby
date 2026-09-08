import { SpeedSettings } from '@/globals/SpeedSettings'

import { createGlobalOps } from '../generic'
import { speedSettings, speedSettingsArrayTables, speedSettingsGroupFields } from '../schema'

/**
 * Payload's document shape for the `speed-settings` global - see
 * src/globals/SpeedSettings.ts. `caching`/`assets`/`media`/`fonts` are plain
 * `group` fields (scalars only) - flattened onto the table with a column
 * prefix by generateTable() alone, same mechanism SiteSettings' `theme`/`seo`
 * already proved, reconstructed here purely by passing
 * `speedSettingsGroupFields` into createGlobalOps (see generic.ts's
 * nestGroups/flattenGroups).
 *
 * `advanced` is the one group with real wiring behind it: its
 * `preconnectOrigins`/`prefetchDns` fields are `array` fields living INSIDE a
 * TOP-LEVEL group - a shape no earlier global/collection needed (Forms'
 * `conditional.rules`, the only prior array-inside-group, is a group nested
 * inside an ARRAY's own subfields, the opposite nesting). ../schema/index.ts's
 * wiring for this global builds each array's child table by hand with
 * generateArrayTable (confirmed against Payload's own real
 * @payloadcms/drizzle traverseFields.js that a group's array subfield gets a
 * table named `<parentTable>_<group>_<field>` but the exact same row shape -
 * `_order`/integer `_parent_id` FK to the OUTER document, string `id` - as a
 * bare top-level array; see that file's own doc comment) and hand-patches
 * `speedSettingsGroupFields`'s `advanced` entry with a synthetic
 * `arrayFieldNames: ['preconnectOrigins', 'prefetchDns']` so
 * nestGroups/flattenGroups fold them into `advanced.*` the same way
 * GroupFieldMeta already does for a group nested inside an array (see that
 * type's own doc comment in ../schema/generate.ts).
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

const ops = createGlobalOps(speedSettings, SpeedSettings, speedSettingsArrayTables, {
  groupFields: speedSettingsGroupFields,
})

/**
 * `attachArrays` (run inside ops.find/ops.update, BEFORE nestGroups - see
 * ../generic.ts's createGlobalOps) already lands `advanced.preconnectOrigins`/
 * `advanced.prefetchDns` at the synthetic `advancedPreconnectOrigins`/
 * `advancedPrefetchDns` keys nestGroups expects, so reads need no extra work.
 * Writes do: ops.update's own splitSpecialFields runs on the caller's raw,
 * still-nested input BEFORE any group-flattening, so it can only ever see a
 * flat `advancedPreconnectOrigins` key, never `advanced.preconnectOrigins` -
 * this reproduces that same synthetic key on the way in. (`data.advanced`
 * itself is left otherwise untouched - flattenGroups only ever reads
 * `subFieldNames`, so the two array keys still sitting inside it are simply
 * ignored there, same as any other unrecognised key would be.)
 */
function toRawUpdateInput(data: Partial<Omit<SpeedSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...data }
  const advanced = data.advanced as { preconnectOrigins?: unknown; prefetchDns?: unknown } | null | undefined
  if (advanced?.preconnectOrigins !== undefined) raw.advancedPreconnectOrigins = advanced.preconnectOrigins
  if (advanced?.prefetchDns !== undefined) raw.advancedPrefetchDns = advanced.prefetchDns
  return raw
}

export const findSpeedSettings = ops.find as unknown as () => Promise<SpeedSettingsDoc | null>
export const updateSpeedSettings = async (
  data: Partial<Omit<SpeedSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
): Promise<SpeedSettingsDoc> => (await ops.update(toRawUpdateInput(data))) as unknown as SpeedSettingsDoc
