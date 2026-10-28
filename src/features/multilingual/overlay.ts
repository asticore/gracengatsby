import { valueAtPath, type TranslationRow } from './store'
import { fieldsForDocument, sourceIdFor, translatableSource } from './translatableFields'
import { isBlockFieldPath, writeBlockField } from './blockText'
import { publishIndex, publishableText } from './availability'
import type { MultilingualSettings } from './settings'

/**
 * The pure half of applying translations to a document.
 *
 * Nothing here touches the engine, D1 or the request, so the overlay rules can
 * be tested in isolation. `applyTranslations.ts` does the loading.
 *
 * Only fields that `translatableFields.ts` names, and that are plain strings in
 * the document, are overlaid. Rich text is left in the default language: its
 * tree is not a string, and substituting flattened text would drop formatting.
 *
 * Whether a stored translation may be shown is decided by
 * `isTranslationPublishable` (translationStatus.ts), with the field's current
 * source text, so a stale approval is never overlaid.
 */

/**
 * Overlays translated plain-string fields for one document.
 *
 * `lookup` returns the publishable translation for a field, or null when there
 * is none. It is given the field's current source text so staleness is judged
 * against what the page is about to show. Missing translations fall back to the
 * source text when `fallbackToDefault` is true, and become empty otherwise. A
 * source field that is not a string (for example a missing value or a rich-text
 * tree) is left exactly as it was.
 */
export function overlayDocument<T>(
  doc: T,
  collection: string,
  documentId: string | number,
  lookup: (sourceId: string, fieldPath: string, currentSourceText: string) => string | null,
  fallbackToDefault: boolean,
): T {
  const source = translatableSource(collection)
  if (!source || !doc || typeof doc !== 'object') return doc

  let out = doc
  const sourceId = sourceIdFor(collection, documentId)

  for (const field of fieldsForDocument(collection, doc)) {
    if (field.richText) continue
    const original = valueAtPath(doc, field.path)
    if (typeof original !== 'string') continue

    const translated = lookup(sourceId, field.path, original)
    if (translated !== null && translated.trim().length > 0) {
      out = withValueAtPath(out, field.path, translated)
    } else if (!fallbackToDefault && !field.group) {
      // Block text is never blanked: a button or heading with no translation shows the source line.
      out = withValueAtPath(out, field.path, '')
    }
  }
  return out
}

/** Immutable set along a dot path; creates intermediate objects when they are missing. */
function withValueAtPath<T>(document: T, path: string, value: unknown): T {
  if (isBlockFieldPath(path)) return writeBlockField(document, path, value) as T
  const [head, ...rest] = path.split('.')
  if (head === undefined) return document
  const base = (document && typeof document === 'object' ? document : {}) as Record<string, unknown>
  const next = rest.length === 0 ? value : withValueAtPath(base[head], rest.join('.'), value)
  return { ...base, [head]: next } as T
}

/**
 * Builds the lookup for `overlayDocument` from one locale's loaded rows. Rows
 * the public site may not show come back as null, so they fall back like a
 * missing translation.
 */
export function lookupFromRows(
  locale: string,
  rows: TranslationRow[],
  settings: Pick<MultilingualSettings, 'requireReview'>,
): (sourceId: string, fieldPath: string, currentSourceText: string) => string | null {
  const index = publishIndex(rows.filter((row) => row.locale === locale))
  return (sourceId, fieldPath, currentSourceText) => publishableText(index, settings, locale, sourceId, fieldPath, currentSourceText)
}

