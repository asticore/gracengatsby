import { MediaSettings } from '@/globals/MediaSettings'

import { createGlobalOps } from '../generic'
import { mediaSettings, mediaSettingsGroupFields, mediaSettingsResizingResponsiveWidths } from '../schema'

/**
 * Payload's document shape for the `media-settings` global - see
 * src/globals/MediaSettings.ts. `optimisation`/`delivery`/`bulk` are plain
 * `group` fields (scalars only) - flattened onto the table with a column
 * prefix by generateTable() alone, same mechanism SiteSettings' `theme`/`seo`
 * already proved, reconstructed here purely by passing
 * `mediaSettingsGroupFields` into createGlobalOps.
 *
 * `resizing` is Phase 20's Gap A1: `responsiveWidths` is an `array` field
 * living INSIDE a TOP-LEVEL group - same shape, same
 * ../schema/index.ts `wireTopLevelGroupFields` wiring, as SpeedSettings'
 * `advanced.preconnectOrigins`/`advanced.prefetchDns` - see that file's own
 * doc comment for the full explanation. `resizing.generateResponsiveSizes`
 * toggling whether `responsiveWidths` is shown is a pure admin-UI
 * `condition` (see MediaSettings.ts) - it never affects storage, so this
 * data layer reads/writes the array unconditionally, same as every other
 * field.
 *
 * This app's Media collection has no `imageSizes` configured (sharp is
 * unavailable on the Workers runtime it deploys to - see
 * ../schema/generate.ts's uploadColumns doc comment), so despite the
 * `resizing` group's naming, none of this data is wired to any actual image
 * resizing - it is stored settings only, the same as every other scalar
 * field in this global.
 */
export type MediaSettingsDoc = {
  id: number
  optimisation?: {
    provider?: string | null
    quality?: number | null
    convertToWebp?: boolean | null
    convertToAvif?: boolean | null
    stripMetadata?: boolean | null
  } | null
  resizing?: {
    maxWidth?: number | null
    maxHeight?: number | null
    generateResponsiveSizes?: boolean | null
    responsiveWidths?: { id: string; width?: number | null }[] | null
  } | null
  delivery?: {
    cloudflareAccountHash?: string | null
    deliveryUrlPrefix?: string | null
  } | null
  bulk?: {
    batchSize?: number | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  mediaSettings,
  MediaSettings,
  { resizingResponsiveWidths: mediaSettingsResizingResponsiveWidths },
  { groupFields: mediaSettingsGroupFields },
)

export const findMediaSettings = ops.find as unknown as () => Promise<MediaSettingsDoc | null>
export const updateMediaSettings = ops.update as unknown as (
  data: Partial<Omit<MediaSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<MediaSettingsDoc>
