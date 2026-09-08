import type { FeatureKey } from '@/features/registry'

import { SiteSettings } from '@/globals/SiteSettings'

import { createGlobalOps } from '../generic'
import { siteSettings, siteSettingsGenerated } from '../schema'

/**
 * Payload's document shape for the `site-settings` global - see
 * src/globals/SiteSettings.ts.
 *
 * `logo`/`favicon`/`seo.defaultOgImage` are single (non-hasMany, non-
 * polymorphic) `upload` fields pointing at Media - confirmed via
 * ../schema/generate.ts's columnFor doc comment that a single relationship
 * or upload field is indistinguishable from Payload's POV: both become a
 * plain `<name>_id` FK column (`logo_id`, `favicon_id`,
 * `seo_default_og_image_id`), never routed through generateRelsTable. That
 * only happens for hasMany/polymorphic relationship/upload fields (see
 * isHasManyRelational) - none of which SiteSettings declares - so unlike
 * FaqSettings (hasMany `faqs` inside a block) this global needs no
 * `relsTable`/`blocksFields` wiring at all.
 *
 * `theme`, `seo`, and `features` (built from the FEATURES registry - see
 * src/features/featureToggleField.ts) are `group` fields: flattened onto
 * the table with a column prefix (`theme_primary_color`,
 * `seo_default_description`, `features_<key>`, ...) by generateTable()
 * alone - no extra schema-side wiring - and reconstructed as nested objects
 * here purely by passing `siteSettingsGenerated.groupFields` into
 * createGlobalOps (see generic.ts's nestGroups/flattenGroups). `features`'
 * subfield set is dynamic (one checkbox per FEATURES entry), so it's typed
 * as a partial record over `FeatureKey` rather than spelled out by name.
 */
export type SiteSettingsDoc = {
  id: number
  siteName?: string | null
  tagline?: string | null
  logo?: number | null
  favicon?: number | null
  theme?: {
    primaryColor?: string | null
    accentColor?: string | null
    backgroundColor?: string | null
    headingFont?: string | null
    bodyFont?: string | null
    buttonStyle?: string | null
    cornerStyle?: string | null
    hoverEffect?: string | null
  } | null
  seo?: {
    titleTemplate?: string | null
    defaultDescription?: string | null
    defaultOgImage?: number | null
    twitterHandle?: string | null
    siteIndexable?: boolean | null
  } | null
  features?: Partial<Record<FeatureKey, boolean | null>> | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(siteSettings, SiteSettings, {}, {
  groupFields: siteSettingsGenerated.groupFields,
})

export const findSiteSettings = ops.find as unknown as () => Promise<SiteSettingsDoc | null>
export const updateSiteSettings = ops.update as unknown as (
  data: Partial<Omit<SiteSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SiteSettingsDoc>
