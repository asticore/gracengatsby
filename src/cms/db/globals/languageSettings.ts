import { LanguageSettings } from '@/globals/LanguageSettings'

import { createGlobalOps } from '../generic'
import { languageSettings, languageSettingsActiveLocales, languageSettingsGenerated } from '../schema'

/**
 * Payload's document shape for the `language-settings` global - see
 * src/globals/LanguageSettings.ts. Every field lives inside the one
 * `multilingual` group; the group is reconstructed as a nested object here
 * exactly like any other top-level group already modeled (Pages' `seo`,
 * SeoSettings' groups below).
 *
 * `activeLocales` is a hasMany `select` - same mechanism Users' `roles` and
 * FieldGroups' `targetCollections` already proved (generateSelectHasManyTable/
 * createSelectHasManyOps) - EXCEPT that in both of those precedents the field
 * sits at the TOP LEVEL of the document, never inside a group. Here it is
 * nested inside `multilingual`, a shape neither precedent nor
 * ../schema/generate.ts's `processFields` currently supports: a hasMany
 * `select` (or a plain `array`, see SeoSettings' `sameAs`) inside a `group`
 * hits an explicit `throw` in `processFields`' group branch ("hasMany select
 * ... inside group ... is not supported yet" / "group ... may only contain
 * plain fields"), confirmed by actually calling `generateTable(LanguageSettings)`
 * - see this repo's PR/task notes for the exact thrown message. This file is
 * therefore written against a PROPOSED, not-yet-applied extension to
 * ../schema/generate.ts and ../generic.ts (see the wiring notes delivered
 * alongside this file) that generalises the table-naming half of the already-
 * proven `generateNestedArrayTable`/`nestedArrayTables` `groupName` mechanism
 * (Forms' `conditional.rules`) one level up, to a hasMany select/array field
 * living directly in one of the MAIN document's own top-level groups, backed
 * by a REAL confirmed shape: the committed, Payload-generated
 * `src/migrations/schema/settingsSchema.ts` already contains the exact DDL
 * Payload's own engine produced for this collection
 * (`ac_language_settings_multilingual_active_locales` - `order`/`parent_id`/
 * `value`/`id`, no underscore prefix, integer `parent_id` straight to the
 * main table - byte-for-byte the same child-table shape
 * `generateSelectHasManyTable` already produces for an UNGROUPED hasMany
 * select, just under a group-prefixed table name). `languageSettingsActiveLocales`
 * (../schema/index.ts) is expected to be that table, and `createGlobalOps`'s
 * `selectTables` option is expected to accept `{ groupName: 'multilingual' }`
 * alongside a select field's table so `attachSelects`/`splitSpecialFields`
 * route the value through `doc.multilingual.activeLocales` instead of a
 * top-level `doc.activeLocales` - see this global's delivered gap notes for
 * the exact minimal patch this depends on.
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

const ops = createGlobalOps(languageSettings, LanguageSettings, {}, {
  groupFields: languageSettingsGenerated.groupFields,
  // `{ groupName }` alongside the table is the proposed extension - see this
  // file's doc comment above and the delivered gap notes. Until that lands,
  // `selectTables` only accepts a bare `AnySQLiteTable`.
  selectTables: { activeLocales: { table: languageSettingsActiveLocales, groupName: 'multilingual' } } as unknown as Record<string, typeof languageSettingsActiveLocales>,
})

export const findLanguageSettings = ops.find as unknown as () => Promise<LanguageSettingsDoc | null>
export const updateLanguageSettings = ops.update as unknown as (
  data: Partial<Omit<LanguageSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LanguageSettingsDoc>
