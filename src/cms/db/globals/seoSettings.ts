import { SeoSettings } from '@/globals/SeoSettings'

import { createGlobalOps } from '../generic'
import { generateSelectHasManyTable } from '../schema/generate'
import { seoSettings, seoSettingsGenerated, seoSettingsGroupFields, seoSettingsSchemaSameAs } from '../schema'

/** One row of the `schema.sameAs` array - see src/globals/SeoSettings.ts. A single-field array (`url` only), the exact same shape MembershipTiers' `benefits` proved (an array whose only subfield is a plain text column, its own child table, not a `_rels` row - schema/index.ts's `membershipTiersBenefits` comment) - just nested inside a group here instead of sitting at the document's top level. */
export type SeoSettingsSameAsRow = { id?: string; url?: string | null }

/**
 * The original engine's document shape for the `seo-settings` global - see
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
  /**
   * The `siteFiles` group (Site files: llms.txt, security.txt, ads.txt,
   * app-ads.txt, humans.txt, the web app manifest and the server rules). Its
   * `llmsIncludeCollections` is a hasMany select, so it arrives as a string[].
   * Shape from src/globals/SeoSettings.ts; the columns are `site_files_*`.
   */
  siteFiles?: {
    llmsEnabled?: boolean | null
    llmsTitle?: string | null
    llmsSummary?: string | null
    llmsIncludeCollections?: string[] | null
    llmsExcludePaths?: string | null
    securityTxtContact?: string | null
    securityTxtExpires?: string | null
    securityTxtPolicy?: string | null
    securityTxtLanguages?: string | null
    securityTxtCustom?: string | null
    adsTxt?: string | null
    appAdsTxt?: string | null
    humansTxt?: string | null
    manifestName?: string | null
    manifestShortName?: string | null
    manifestThemeColor?: string | null
    manifestBackgroundColor?: string | null
    manifestDisplay?: string | null
    serverResponseHeaders?: string | null
    serverBlockedPaths?: string | null
    overview?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

/**
 * `siteFiles.llmsIncludeCollections`: a hasMany select inside a top-level group,
 * the same shape as LanguageSettings' `multilingual.activeLocales`. The schema
 * index only wires the tables it already needs, and it is generated, so this
 * child table is built here from the same config with the same generator
 * function. Its name is `eg_seo_settings_site_files_llms_include_collections`,
 * which the site-files migration creates on existing installs.
 */
type LooseField = { name?: string; type?: string; fields?: LooseField[] }
/** Depth-first search through layout rows, which hold fields without a name of their own. */
const findField = (fields: LooseField[], name: string): LooseField | undefined => {
  for (const field of fields) {
    if (field.name === name) return field
    const nested = field.fields ? findField(field.fields, name) : undefined
    if (nested) return nested
  }
  return undefined
}
const siteFilesGroup = (SeoSettings.fields as unknown as LooseField[]).find(
  (field) => field.type === 'group' && field.name === 'siteFiles',
)
const llmsIncludeCollectionsField = findField(siteFilesGroup?.fields ?? [], 'llmsIncludeCollections')
const siteFilesLlmsIncludeCollections = generateSelectHasManyTable(
  seoSettingsGenerated.tableName,
  llmsIncludeCollectionsField as unknown as Parameters<typeof generateSelectHasManyTable>[1],
  'site_files_',
)

const ops = createGlobalOps(
  seoSettings,
  SeoSettings,
  { schemaSameAs: seoSettingsSchemaSameAs },
  {
    groupFields: seoSettingsGroupFields,
    selectTables: { siteFilesLlmsIncludeCollections },
  },
)

export const findSeoSettings = ops.find as unknown as () => Promise<SeoSettingsDoc | null>
export const updateSeoSettings = ops.update as unknown as (
  data: Partial<Omit<SeoSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SeoSettingsDoc>
