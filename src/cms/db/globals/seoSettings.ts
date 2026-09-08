import { SeoSettings } from '@/globals/SeoSettings'

import { createGlobalOps } from '../generic'
import { seoSettings, seoSettingsGenerated, seoSettingsSameAs } from '../schema'

/** One row of the `schema.sameAs` array - see src/globals/SeoSettings.ts. A single-field array (`url` only), the exact same shape MembershipTiers' `benefits` proved (an array whose only subfield is a plain text column, its own child table, not a `_rels` row - schema/index.ts's `membershipTiersBenefits` comment) - just nested inside a group here instead of sitting at the document's top level. */
export type SeoSettingsSameAsRow = { id?: string; url?: string | null }

/**
 * Payload's document shape for the `seo-settings` global - see
 * src/globals/SeoSettings.ts. Six of its seven groups (`defaults`,
 * `indexing`, `verification`, `analytics`, `sitemap`, `customCode`) are
 * plain-field groups, the already-proven top-level-group mechanism (Pages'
 * `seo`) with nothing new - including `defaults.defaultOgImage` and
 * `schema.logo`, single-target `upload->media` fields inside a group,
 * confirmed the same already-proven mechanism as any other single-target
 * relationship/upload inside a group (Forms' `payment.product`).
 *
 * `schema.sameAs` is the one new shape: a plain `array` field (not hasMany
 * relationship/upload, not a rels row - fields: [{ name: 'url', type: 'text' }],
 * confirmed by reading src/globals/SeoSettings.ts directly rather than
 * assuming - it is NOT a bare array of strings the way the task brief
 * described "scalar array"; it is structurally identical to MembershipTiers'
 * `benefits`, a single-subfield array of objects) living INSIDE a group
 * instead of at the document's top level. `processFields` (../schema/generate.ts)
 * currently throws on exactly this ("group ... may only contain plain fields
 * - sameAs (array) inside a group is not supported yet"), confirmed by
 * actually calling `generateTable(SeoSettings)`.
 *
 * This file is written against a PROPOSED, not-yet-applied extension - see
 * languageSettings.ts's doc comment for the general shape of that gap
 * (identical mechanism, this global's is the `array`-in-group half rather
 * than the hasMany-`select`-in-group half). The confirmed REAL shape, from
 * the committed, Payload-generated `src/migrations/schema/settingsSchema.ts`:
 * `ac_seo_settings_schema_same_as` - `_order`/`_parent_id`/`id` (text PK)/`url`,
 * `_parent_id` an INTEGER straight to the main `ac_seo_settings` table -
 * byte-for-byte `generateArrayTable`'s existing UNGROUPED array child-table
 * shape (confirmed against `eg_membership_tiers_benefits`), just under a
 * group-prefixed table name (`schema_same_as`, not `same_as`) - NOT
 * `generateNestedArrayTable`'s shape (that one's `_parent_id` is TEXT,
 * pointing at a parent ARRAY ROW's own string id - confirmed against
 * `eg_forms_fields_conditional_rules` - wrong parent-id type for a field
 * parented directly off the main document). `seoSettingsSameAs`
 * (../schema/index.ts) is expected to be `generateArrayTable`'s table with a
 * `groupDbPrefix` param threaded through for the table name only; `createGlobalOps`'s
 * `arrayTables` option is expected to accept `{ groupName: 'schema' }`
 * alongside the table so `attachArrays`/`splitSpecialFields` route the value
 * through `doc.schema.sameAs` instead of a top-level `doc.sameAs` - see this
 * global's delivered gap notes for the exact minimal patch this depends on.
 */
export type SeoSettingsDoc = {
  id: number
  defaults?: {
    titleTemplate?: string | null
    metaDescription?: string | null
    defaultOgImage?: number | null
    twitterHandle?: string | null
  } | null
  indexing?: {
    allowIndexing?: boolean | null
    noindexPaths?: string | null
    customRobotsTxt?: string | null
  } | null
  verification?: {
    google?: string | null
    bing?: string | null
    pinterest?: string | null
  } | null
  analytics?: {
    ga4MeasurementId?: string | null
    gtmContainerId?: string | null
    metaPixelId?: string | null
    requireCookieConsent?: boolean | null
  } | null
  schema?: {
    organisationName?: string | null
    type?: string | null
    logo?: number | null
    sameAs?: SeoSettingsSameAsRow[] | null
  } | null
  sitemap?: {
    enabled?: boolean | null
    changeFrequency?: string | null
    excludePaths?: string | null
  } | null
  customCode?: {
    headScripts?: string | null
    bodyEndScripts?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  seoSettings,
  SeoSettings,
  // `{ groupName }` alongside the table is the proposed extension - see this
  // file's doc comment above and the delivered gap notes. Until that lands,
  // `arrayTables` only accepts a bare table or the existing ArrayFieldDef
  // shape (table/groupFields/nestedArrayTables), neither of which carries a
  // groupName for the array field ITSELF.
  { sameAs: { table: seoSettingsSameAs, groupName: 'schema' } as unknown as typeof seoSettingsSameAs },
  { groupFields: seoSettingsGenerated.groupFields },
)

export const findSeoSettings = ops.find as unknown as () => Promise<SeoSettingsDoc | null>
export const updateSeoSettings = ops.update as unknown as (
  data: Partial<Omit<SeoSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SeoSettingsDoc>
