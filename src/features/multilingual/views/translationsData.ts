import { INTERFACE_SOURCE_ID, INTERFACE_STRINGS } from '../interfaceStrings'
import type { MultilingualSettings } from '../settings'
import {
  findTranslations,
  sourceTextOf,
  translationKey,
  valueAtPath,
  type TranslationKind,
  type TranslationRow,
} from '../store'
import { sourceIdFor, TRANSLATABLE_COLLECTIONS, translatableSource } from '../translatableFields'

/**
 * Assembles the rows the translation screen shows.
 *
 * Split from the component for the same reason the dashboard's data is: the
 * querying is the part most likely to need reading on its own, and a failure
 * in one collection degrades to "that collection has no rows today" rather
 * than an empty admin screen.
 *
 * The screen is loaded one collection - and optionally one document - at a
 * time, on purpose. Every translatable field of every document across five
 * collections is a table nobody can use and a query nobody should run on a
 * worker; the filters are not a convenience, they are what makes the page
 * answerable at all.
 */

export type TranslationCell = {
  locale: string
  value: string
  /** Row id in `eg_translations`, absent until this cell has been saved once. */
  id: string | number | null
  /** True when the source text has changed since this translation was saved. */
  stale: boolean
}

export type TranslationTableRow = {
  /** Stable key for React and for the save request. */
  key: string
  sourceKind: TranslationKind
  sourceId: string
  fieldPath: string
  label: string
  /** Extra line under the label: the string's context, or the document title. */
  hint: string
  sourceText: string
  multiline: boolean
  cells: TranslationCell[]
}

export type LocaleProgress = {
  locale: string
  translated: number
  total: number
}

export type DocumentOption = {
  id: string
  title: string
}

export type TranslationsPageData = {
  settings: MultilingualSettings
  /** Languages that get a column: everything active except the source. */
  targetLocales: string[]
  collections: { slug: string; label: string }[]
  documents: DocumentOption[]
  rows: TranslationTableRow[]
  progress: LocaleProgress[]
}

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

const DOCUMENT_PICKER_LIMIT = 200

function cellsFor(
  targetLocales: string[],
  byKey: Map<string, TranslationRow>,
  sourceKind: TranslationKind,
  sourceId: string,
  fieldPath: string,
  sourceText: string,
): TranslationCell[] {
  return targetLocales.map((locale) => {
    const row = byKey.get(translationKey({ locale, sourceKind, sourceId, fieldPath }))
    const value = row?.value ?? ''
    return {
      locale,
      value,
      id: row?.id ?? null,
      // Only meaningful once something has been saved: an empty cell is
      // untranslated, not stale, and flagging both the same way would make
      // the stale marker useless.
      stale: Boolean(value) && Boolean(row?.sourceText) && row?.sourceText !== sourceText,
    }
  })
}

async function interfaceRows(
  engine: EngineLike,
  targetLocales: string[],
  group: string | null,
): Promise<TranslationTableRow[]> {
  const rows = await findTranslations(engine, { locales: targetLocales, sourceKind: 'interface' })
  const byKey = new Map(rows.map((row) => [translationKey(row), row]))

  return INTERFACE_STRINGS.filter((entry) => !group || entry.group === group).map((entry) => ({
    key: `interface:${entry.key}`,
    sourceKind: 'interface' as const,
    sourceId: INTERFACE_SOURCE_ID,
    fieldPath: entry.key,
    label: entry.key,
    hint: entry.context,
    sourceText: entry.en,
    multiline: entry.en.length > 48,
    cells: cellsFor(targetLocales, byKey, 'interface', INTERFACE_SOURCE_ID, entry.key, entry.en),
  }))
}

async function contentRows(
  engine: EngineLike,
  targetLocales: string[],
  slug: string,
  documentId: string | null,
): Promise<{ rows: TranslationTableRow[]; documents: DocumentOption[] }> {
  const source = translatableSource(slug)
  if (!source) return { rows: [], documents: [] }

  let docs: Record<string, unknown>[] = []

  try {
    const result = await engine.find({
      collection: slug,
      where: documentId ? { id: { equals: documentId } } : {},
      limit: documentId ? 1 : DOCUMENT_PICKER_LIMIT,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: false,
    })
    docs = result.docs as Record<string, unknown>[]
  } catch {
    // A collection belonging to a switched-off feature is not an error here.
    return { rows: [], documents: [] }
  }

  const documents: DocumentOption[] = docs.map((doc) => ({
    id: String(doc.id),
    title: String(valueAtPath(doc, source.titleField) ?? `Untitled ${doc.id}`),
  }))

  // Without a chosen document the screen is a picker, not a table: rendering
  // every field of two hundred documents is the unusable page the filters
  // exist to prevent.
  if (!documentId) return { rows: [], documents }

  const chosen = docs[0]
  if (!chosen) return { rows: [], documents }

  const sourceId = sourceIdFor(slug, String(chosen.id))
  const stored = await findTranslations(engine, { locales: targetLocales, sourceKind: 'collection', sourceId })
  const byKey = new Map(stored.map((row) => [translationKey(row), row]))
  const title = String(valueAtPath(chosen, source.titleField) ?? chosen.id)

  const rows = source.fields
    .map((field) => {
      const sourceText = sourceTextOf(valueAtPath(chosen, field.path))
      return {
        key: `${sourceId}:${field.path}`,
        sourceKind: 'collection' as const,
        sourceId,
        fieldPath: field.path,
        label: field.label,
        hint: field.richText ? `${title} - rich text, translated as plain paragraphs` : title,
        sourceText,
        multiline: field.size === 'long',
        cells: cellsFor(targetLocales, byKey, 'collection', sourceId, field.path, sourceText),
      }
    })
    // A field nobody filled in has nothing to translate, and an empty source
    // cell teaches a translator nothing.
    .filter((row) => row.sourceText.length > 0)

  return { rows, documents }
}

/**
 * Progress is counted across the whole site, not the rows on screen.
 *
 * The number people want is "how far through German am I", and a percentage
 * that changes when you filter answers a question nobody asked.
 */
async function localeProgress(engine: EngineLike, targetLocales: string[]): Promise<LocaleProgress[]> {
  const stored = await findTranslations(engine, { locales: targetLocales })
  const counts = new Map<string, number>()

  for (const row of stored) {
    if (!row.value || row.value.trim().length === 0) continue
    counts.set(row.locale, (counts.get(row.locale) ?? 0) + 1)
  }

  // The denominator is interface strings plus every translatable field on
  // every document, which is only knowable by counting documents. That is one
  // count query per collection rather than a full load.
  let contentTotal = 0
  for (const collection of TRANSLATABLE_COLLECTIONS) {
    try {
      const result = (await engine.find({
        collection: collection.slug,
        limit: 0,
        depth: 0,
        overrideAccess: false,
      })) as { totalDocs?: number }
      contentTotal += (result.totalDocs ?? 0) * collection.fields.length
    } catch {
      // Feature off, or table not migrated: contributes nothing to the total.
    }
  }

  const total = INTERFACE_STRINGS.length + contentTotal

  return targetLocales.map((locale) => ({
    locale,
    translated: counts.get(locale) ?? 0,
    total,
  }))
}

export async function getTranslationsPageData(args: {
  engine: EngineLike
  settings: MultilingualSettings
  scope: string
  documentId: string | null
  group: string | null
}): Promise<TranslationsPageData> {
  const { engine, settings, scope, documentId, group } = args

  const targetLocales = settings.activeLocales.filter((code) => code !== settings.defaultLocale)

  const collections = TRANSLATABLE_COLLECTIONS.map((entry) => ({ slug: entry.slug, label: entry.label }))

  if (targetLocales.length === 0) {
    return { settings, targetLocales, collections, documents: [], rows: [], progress: [] }
  }

  const progress = await localeProgress(engine, targetLocales)

  if (scope === 'interface') {
    return {
      settings,
      targetLocales,
      collections,
      documents: [],
      rows: await interfaceRows(engine, targetLocales, group),
      progress,
    }
  }

  const { rows, documents } = await contentRows(engine, targetLocales, scope, documentId)
  return { settings, targetLocales, collections, documents, rows, progress }
}
