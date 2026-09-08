import { MediaSettings } from '@/globals/MediaSettings'

import { createGlobalOps } from '../generic'
import { mediaSettings, mediaSettingsArrayTables, mediaSettingsGroupFields } from '../schema'

/**
 * Payload's document shape for the `media-settings` global - see
 * src/globals/MediaSettings.ts. `optimisation`/`delivery`/`bulk` are plain
 * `group` fields (scalars only) - flattened onto the table with a column
 * prefix by generateTable() alone, same mechanism SiteSettings' `theme`/`seo`
 * already proved, reconstructed here purely by passing
 * `mediaSettingsGroupFields` into createGlobalOps.
 *
 * `resizing` is the one group with real wiring behind it: `responsiveWidths`
 * is an `array` field living INSIDE a TOP-LEVEL group - same shape, same
 * ../schema/index.ts hand-built generateArrayTable + synthetic
 * `arrayFieldNames` wiring, as SpeedSettings' `advanced.preconnectOrigins`/
 * `advanced.prefetchDns` - see that file's own doc comment for the full
 * explanation and the confirmed real Payload table-naming convention it
 * mirrors. `resizing.generateResponsiveSizes` toggling whether
 * `responsiveWidths` is shown is a pure admin-UI `condition` (see
 * MediaSettings.ts) - it never affects storage, so this data layer reads/
 * writes the array unconditionally, same as every other field.
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

const ops = createGlobalOps(mediaSettings, MediaSettings, mediaSettingsArrayTables, {
  groupFields: mediaSettingsGroupFields,
})

/** See speedSettings.ts's own toRawUpdateInput doc comment - identical reasoning, just one array field (`resizing.responsiveWidths`) instead of two. */
function toRawUpdateInput(data: Partial<Omit<MediaSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...data }
  const resizing = data.resizing as { responsiveWidths?: unknown } | null | undefined
  if (resizing?.responsiveWidths !== undefined) raw.resizingResponsiveWidths = resizing.responsiveWidths
  return raw
}

export const findMediaSettings = ops.find as unknown as () => Promise<MediaSettingsDoc | null>
export const updateMediaSettings = async (
  data: Partial<Omit<MediaSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
): Promise<MediaSettingsDoc> => (await ops.update(toRawUpdateInput(data))) as unknown as MediaSettingsDoc
