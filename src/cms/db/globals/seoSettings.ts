import { SeoSettings } from '@/globals/SeoSettings'

import { createGlobalOps } from '../generic'
import { seoSettings, seoSettingsGroupFields, seoSettingsSchemaSameAs } from '../schema'

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
 * `schema.sameAs` is Phase 20's Gap A1: a plain `array` field (fields:
 * [{ name: 'url', type: 'text' }] - structurally identical to
 * MembershipTiers' `benefits`, a single-subfield array of objects) living
 * INSIDE a group instead of at the document's top level. Confirmed against
 * the real `ac_seo_settings_schema_same_as` table (`_order`/`_parent_id`/
 * `id` (text PK)/`url`, `_parent_id` an INTEGER straight to the main
 * `ac_seo_settings` table) to be byte-for-byte `generateArrayTable`'s
 * existing UNGROUPED array child-table shape (confirmed against
 * `eg_membership_tiers_benefits`), just under a group-prefixed table name
 * (`schema_same_as`, not `same_as`). ../schema/index.ts's
 * `wireTopLevelGroupFields` builds `seoSettingsSchemaSameAs` from
 * generate.ts's own `topLevelGroupFields` output, keyed here by the
 * synthetic `schemaSameAs` key (matching `seoSettingsGroupFields`'s `schema`
 * entry's `arrayFieldNames: ['sameAs']`, computed by generate.ts, not
 * hand-patched) so both read and write fold it into `schema.sameAs`
 * automatically.
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
  { schemaSameAs: seoSettingsSchemaSameAs },
  { groupFields: seoSettingsGroupFields },
)

export const findSeoSettings = ops.find as unknown as () => Promise<SeoSettingsDoc | null>
export const updateSeoSettings = ops.update as unknown as (
  data: Partial<Omit<SeoSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SeoSettingsDoc>
