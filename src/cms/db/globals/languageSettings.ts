import { LanguageSettings } from '@/globals/LanguageSettings'

import { createGlobalOps } from '../generic'
import { languageSettings, languageSettingsGroupFields, languageSettingsMultilingualActiveLocales } from '../schema'

/**
 * Payload's document shape for the `language-settings` global - see
 * src/globals/LanguageSettings.ts. Every field lives inside the one
 * `multilingual` group; the group is reconstructed as a nested object here
 * exactly like any other top-level group already modeled (Pages' `seo`,
 * SeoSettings' groups).
 *
 * `activeLocales` is a hasMany `select` nested directly inside `multilingual`
 * - Phase 20's Gap A2, confirmed against the real
 * `ac_language_settings_multilingual_active_locales` table (`order`/
 * `parent_id`/`value`/`id`, no underscore prefix, integer `parent_id`
 * straight to the main table) to be byte-for-byte the same child-table shape
 * `generateSelectHasManyTable` already produces for an UNGROUPED hasMany
 * select (Users' `roles`), just under a group-prefixed table name.
 * ../schema/generate.ts's processGroupField now allows this directly, and
 * ../schema/index.ts's `wireTopLevelGroupFields` builds
 * `languageSettingsMultilingualActiveLocales` from generate.ts's own
 * `topLevelGroupFields` output - keyed here by the synthetic
 * `multilingualActiveLocales` key (matching `languageSettingsGroupFields`'s
 * `multilingual` entry's `selectFieldNames: ['activeLocales']`, computed by
 * generate.ts, not hand-patched) so both read (nestGroups' `extractGroup`)
 * and write (../generic.ts's collectGroupSpecialFields-driven lift inside
 * `splitSpecialFields`) fold it into `multilingual.activeLocales`
 * automatically - no per-file reshaping needed.
 */
export type LanguageSettingsDoc = {
  id: number
  multilingual?: {
    enabled?: boolean | null
    defaultLocale?: string | null
    activeLocales?: string[] | null
    fallbackToDefault?: boolean | null
    showLanguageSwitcher?: boolean | null
    switcherPosition?: string | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(
  languageSettings,
  LanguageSettings,
  {},
  {
    groupFields: languageSettingsGroupFields,
    selectTables: { multilingualActiveLocales: languageSettingsMultilingualActiveLocales },
  },
)

export const findLanguageSettings = ops.find as unknown as () => Promise<LanguageSettingsDoc | null>
export const updateLanguageSettings = ops.update as unknown as (
  data: Partial<Omit<LanguageSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LanguageSettingsDoc>
