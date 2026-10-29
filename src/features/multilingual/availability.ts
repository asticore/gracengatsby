import { fieldsForDocument, sourceIdFor, translatableSource, SLUG_FIELD } from './translatableFields'
import type { MultilingualSettings } from './settings'
import { valueAtPath, type TranslationRow } from './store'
import { isTranslationPublishable } from './translationStatus'

/**
 * Which translations the public site may show, and which locales a document
 * can be offered in. Pure: no engine, no request, no node-only imports, so the
 * overlay, the SEO builders, the sitemap and the tests share one rule.
 *
 * The decision itself is `isTranslationPublishable` in translationStatus.ts.
 * This file only applies it to a field, with the field's current source text,
 * so a translation approved against old wording is not shown after the source
 * has changed.
 */

export type PublishIndex = ReadonlyMap<string, TranslationRow>

const keyOf = (locale: string, sourceId: string, fieldPath: string): string => `${locale}|${sourceId}|${fieldPath}`

/** Rows indexed by locale, source and field. Rows are unique on that key in storage. */
export function publishIndex(rows: readonly TranslationRow[]): PublishIndex {
  const index = new Map<string, TranslationRow>()
  for (const row of rows) index.set(keyOf(row.locale, row.sourceId, row.fieldPath), row)
  return index
}

/**
 * The text to show for one field in one locale, or null when the public site
 * may not show a translation for it. `currentSourceText` is the source field
 * as it reads now.
 */
export function publishableText(
  index: PublishIndex,
  settings: Pick<MultilingualSettings, 'requireReview'>,
  locale: string,
  sourceId: string,
  fieldPath: string,
  currentSourceText: string,
): string | null {
  const row = index.get(keyOf(locale, sourceId, fieldPath))
  if (!row || !isTranslationPublishable(row, settings, currentSourceText)) return null
  return row.value && row.value.trim().length > 0 ? row.value : null
}

/** Every active locale except the default, in configured order. */
export const nonDefaultLocales = (settings: Pick<MultilingualSettings, 'defaultLocale' | 'activeLocales'>): string[] =>
  settings.activeLocales.filter((code) => code !== settings.defaultLocale)

/**
 * The non-default locales in which this document has at least one publishable
 * translated field. Rich-text fields are left out, as the overlay leaves them
 * out. Null when the collection has no translatable fields: the route is then
 * not tied to a document and no locale is withheld.
 */
export function publishableLocalesForDocument(args: {
  collection: string
  id: string | number
  doc: unknown
  index: PublishIndex
  settings: MultilingualSettings
}): string[] | null {
  const { collection, id, doc, index, settings } = args
  const source = translatableSource(collection)
  if (!source || !doc || typeof doc !== 'object') return null
  const sourceId = sourceIdFor(collection, id)
  // A slug is not content: a translated URL alone does not make a page available in that language.
  const fields = fieldsForDocument(collection, doc).filter((field) => !field.richText && field.path !== SLUG_FIELD)

  return nonDefaultLocales(settings).filter((locale) =>
    fields.some((field) => {
      const current = valueAtPath(doc, field.path)
      return typeof current === 'string' && publishableText(index, settings, locale, sourceId, field.path, current) !== null
    }),
  )
}
