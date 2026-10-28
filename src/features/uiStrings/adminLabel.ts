import type { UiDictionary, UiStringKey } from './keys'
import { UI_STRING_SOURCE } from './keys'

/**
 * Collection, global and field labels from the config, translated for the admin.
 *
 * The config label is always the English fallback. A translation is used only
 * when the language is not English and the reference table has a key
 * `label.<kind>.<slug>`. English output is therefore the config label, unchanged.
 *
 *   kind 'collection'  label.collection.<collection slug>   (plural name)
 *   kind 'global'      label.global.<global slug>
 *   kind 'field'       label.field.<field name>
 *   kind 'singular'    label.singular.<collection slug>   (singular name, edit screen)
 */
export type AdminLabelKind = 'collection' | 'global' | 'field' | 'singular'

export type AdminLabelContext = {
  locale?: string | null
  dict?: Partial<UiDictionary> | null
}

/** The reference-table key for a label, when one exists. */
export function adminLabelKey(kind: AdminLabelKind, slug: string): UiStringKey | null {
  const key = `label.${kind}.${slug}`
  return key in UI_STRING_SOURCE ? (key as UiStringKey) : null
}

export function adminLabel(
  kind: AdminLabelKind,
  slug: string,
  fallbackEnglish: string,
  context?: AdminLabelContext | null,
): string {
  const base = (context?.locale ?? 'en').trim().toLowerCase().split('-')[0]
  if (!context?.dict || base === 'en') return fallbackEnglish
  const key = adminLabelKey(kind, slug)
  if (!key) return fallbackEnglish
  const value = context.dict[key]
  return typeof value === 'string' && value.length > 0 ? value : fallbackEnglish
}
