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
 *   kind 'desc'        desc.<slug>                        (short description text)
 */
export type AdminLabelKind = 'collection' | 'global' | 'field' | 'singular' | 'desc'

export type AdminLabelContext = {
  locale?: string | null
  dict?: Partial<UiDictionary> | null
}

/** The reference-table key for a label, when one exists. */
export function adminLabelKey(kind: AdminLabelKind, slug: string): UiStringKey | null {
  const key = kind === 'desc' ? `desc.${slug}` : `label.${kind}.${slug}`
  return key in UI_STRING_SOURCE ? (key as UiStringKey) : null
}

/** The translation for a label, or null when the language has none (English always has none). */
function translatedLabel(kind: AdminLabelKind, slug: string, context?: AdminLabelContext | null): string | null {
  const base = (context?.locale ?? 'en').trim().toLowerCase().split('-')[0]
  if (!context?.dict || base === 'en') return null
  const key = adminLabelKey(kind, slug)
  if (!key) return null
  const value = context.dict[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function adminLabel(
  kind: AdminLabelKind,
  slug: string,
  fallbackEnglish: string,
  context?: AdminLabelContext | null,
): string {
  return translatedLabel(kind, slug, context) ?? fallbackEnglish
}

/**
 * A field's label. `path` is the field's place in the config (`metaPixel.enabled`
 * for a field inside the `metaPixel` group); when the table has `label.field.<path>`
 * that wins, so two groups that both hold an `enabled` or `pixelId` field can
 * each have their own label. Otherwise the bare field `name` is used.
 */
export function adminFieldLabel(
  path: string | undefined,
  name: string,
  fallbackEnglish: string,
  context?: AdminLabelContext | null,
): string {
  if (path && path !== name) {
    const scoped = translatedLabel('field', path, context)
    if (scoped) return scoped
  }
  return adminLabel('field', name, fallbackEnglish, context)
}
