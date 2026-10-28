import { type TranslationRow, buildLookup, valueAtPath } from './store'
import { translatableSource, sourceIdFor } from './translatableFields'
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
 */

/**
 * Seam for the publish workflow. Every row a visitor can see passes through
 * here; the default accepts all rows. The approval workflow replaces this
 * decision (for example "approved only") without touching the loader.
 */
export function isTranslationPublishable(_row: TranslationRow, _settings?: MultilingualSettings): boolean {
  return true
}

/** Immutable set along a dot path; creates intermediate objects when they are missing. */
function withValueAtPath<T>(document: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  if (head === undefined) return document
  const base = (document && typeof document === 'object' ? document : {}) as Record<string, unknown>
  const next = rest.length === 0 ? value : withValueAtPath(base[head], rest.join('.'), value)
  return { ...base, [head]: next } as T
}

/**
 * Overlays translated plain-string fields for one document.
 *
 * `lookup` returns the stored translation for a field, or null when none exists.
 * Missing translations fall back to the source text when `fallbackToDefault` is
 * true, and become empty otherwise. A source field that is not a string (for
 * example a missing value or a rich-text tree) is left exactly as it was.
 */
export function overlayDocument<T>(
  doc: T,
  collection: string,
  documentId: string | number,
  lookup: (sourceId: string, fieldPath: string) => string | null,
  fallbackToDefault: boolean,
): T {
  const source = translatableSource(collection)
  if (!source || !doc || typeof doc !== 'object') return doc

  let out = doc
  const sourceId = sourceIdFor(collection, documentId)

  for (const field of source.fields) {
    if (field.richText) continue
    const original = valueAtPath(doc, field.path)
    if (typeof original !== 'string') continue

    const translated = lookup(sourceId, field.path)
    if (translated !== null && translated.trim().length > 0) {
      out = withValueAtPath(out, field.path, translated)
    } else if (!fallbackToDefault) {
      out = withValueAtPath(out, field.path, '')
    }
  }
  return out
}

/** Builds the lookup for `overlayDocument` from already-loaded, already-filtered rows. */
export function lookupFromRows(locale: string, rows: TranslationRow[]): (sourceId: string, fieldPath: string) => string | null {
  const { get } = buildLookup(locale, rows)
  return (sourceId, fieldPath) => get('collection', sourceId, fieldPath)
}
