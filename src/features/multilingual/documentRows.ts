/**
 * One row per page, post, product, event, FAQ ... for the Translations table,
 * the classification of stored translations (active / outdated / inactive) and
 * the orphan selection that "Clear inactive" may delete from.
 *
 * Pure: the loader supplies the live documents and the stored rows, and nothing
 * here reads the engine, so every rule below is covered by a unit test.
 *
 * The three classes, for a stored translation row of an on-page field:
 *   active    - the field still exists on the document and its source text is
 *               the one the translation was made from.
 *   outdated  - the field exists but the source text has changed since. Still
 *               kept: it is the translator's work, and it needs review.
 *   inactive  - the field (or the block holding it) no longer exists, or the
 *               document was deleted. Nothing on the page reads it any more.
 *   unknown   - we cannot tell (the document is simply not in the loaded set, or
 *               the collection is not one this screen knows). Never deleted.
 */

import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import type { ColumnDef } from '@/admin/list/listQuery'

import { translateEditorPath } from '@/views/visualEditor/translateParams'

import type { TranslationRow } from './store'
import { sourceIdFor, translatableSource, TRANSLATABLE_COLLECTIONS } from './translatableFields'
import { buildOverviewRows, type OverviewItemInput, type OverviewRow } from './translationOverview'
import { STATUS_LABELS, TRANSLATION_STATUSES, type TranslationRules } from './translationStatus'

export type TranslationActivity = 'active' | 'outdated' | 'inactive' | 'unknown'

/** A document as it reads now: every translatable field it has, with its current source text. */
export type LiveDocument = {
  collection: string
  documentId: string
  sourceId: string
  title: string
  slug: string | null
  updatedAt: string | null
  /** fieldPath -> current source text ('' when the field is empty). Holds every field, empty or not. */
  fields: ReadonlyMap<string, string>
}

/**
 * What the classifier knows. `documents` are the documents that were loaded.
 * `confirmedMissing` are source ids that were checked against the database
 * with overrideAccess and found not to exist. A document the viewer merely
 * cannot read is in neither, so its rows stay `unknown`.
 */
export type TranslationCatalogue = {
  documents: ReadonlyMap<string, LiveDocument>
  confirmedMissing: ReadonlySet<string>
}

export function classifyTranslation(
  row: Pick<TranslationRow, 'fieldPath' | 'sourceText'>,
  live: Pick<LiveDocument, 'fields'> | undefined,
  confirmedMissing: boolean,
): TranslationActivity {
  if (!live) return confirmedMissing ? 'inactive' : 'unknown'
  if (!live.fields.has(row.fieldPath)) return 'inactive'
  const current = live.fields.get(row.fieldPath) ?? ''
  if (row.sourceText !== null && row.sourceText !== undefined && row.sourceText !== current) return 'outdated'
  return 'active'
}

/** Classifies one stored row. Interface and global rows are never on-page content, so they are `unknown` here. */
export function classifyStoredRow(row: TranslationRow, catalogue: TranslationCatalogue): TranslationActivity {
  if (row.sourceKind !== 'collection') return 'unknown'
  const collection = row.sourceId.split(':')[0] ?? ''
  if (!translatableSource(collection)) return 'unknown'
  return classifyTranslation(row, catalogue.documents.get(row.sourceId), catalogue.confirmedMissing.has(row.sourceId))
}

/**
 * The orphans: stored collection rows classified `inactive`, optionally narrowed
 * to some source ids. This is the only selection "Clear inactive" deletes from.
 */
export function findInactiveRows(
  stored: readonly TranslationRow[],
  catalogue: TranslationCatalogue,
  sourceIds?: ReadonlySet<string>,
): TranslationRow[] {
  return stored.filter(
    (row) =>
      (!sourceIds || sourceIds.has(row.sourceId)) && classifyStoredRow(row, catalogue) === 'inactive',
  )
}

/** The source ids of stored rows whose document is not in the loaded set. The clear action confirms these against the database. */
export function unconfirmedSourceIds(stored: readonly TranslationRow[], catalogue: TranslationCatalogue): string[] {
  const ids = new Set<string>()
  for (const row of stored) {
    if (row.sourceKind !== 'collection') continue
    const collection = row.sourceId.split(':')[0] ?? ''
    if (!translatableSource(collection)) continue
    if (!catalogue.documents.has(row.sourceId)) ids.add(row.sourceId)
  }
  return [...ids]
}

export type InactiveEntry = {
  locale: string
  fieldPath: string
  label: string
  /** 'field-removed' when the field or block is gone; 'document-missing' when the document is gone. */
  reason: 'field-removed' | 'document-missing'
  value: string
}

export type ActivityCounts = { active: number; outdated: number; inactive: number }

export type DocumentCell = {
  locale: string
  status: OverviewRow['cells'][number]['status']
  approved: number
  total: number
  assignees: number[]
  counts: ActivityCounts
  /** Where a click on this language's cell goes. */
  href: string
  /** 'builder' opens the page in the visual builder's Translate mode; 'editor' the document translation editor. */
  mode: 'builder' | 'editor'
}

export type DocumentRow = Omit<OverviewRow, 'cells'> & {
  collection: string
  documentId: string
  /** Public address of the page, or null when there is none. */
  url: string | null
  /** Across all target languages, stored translations that have text. */
  counts: ActivityCounts
  cells: DocumentCell[]
  inactive: InactiveEntry[]
  /** The document's own last-change time: when its source text last moved. */
  lastSourceChange: string | null
  /** Where a click on the row goes: the first target language. */
  href: string
  mode: 'builder' | 'editor'
}

/** `/admin/visual-editor/collection/<slug>/<id>?lang=<locale>&translate=1` for a collection with a builder, else null. */
export function builderHasSurface(collection: string): boolean {
  const surface = VISUAL_EDITOR_SURFACES[collection]
  return Boolean(surface && surface.kind === 'collection' && !surface.formMode)
}

export const builderTranslateHref = translateEditorPath

/**
 * Where a language cell goes. A collection with a builder opens the page in
 * Translate mode for that language; one without falls back to the document
 * translation editor on this screen (`editorHref`).
 */
export function translateTarget(args: { collection: string; documentId: string; locale: string; editorHref: string }): {
  href: string
  mode: 'builder' | 'editor'
} {
  if (builderHasSurface(args.collection)) {
    return { href: builderTranslateHref(args.collection, args.documentId, args.locale), mode: 'builder' }
  }
  return { href: args.editorHref, mode: 'editor' }
}

/** The public page for a document, where the site has one per document. */
export function publicPathFor(collection: string, slug: string | null): string | null {
  if (!slug) return collection === 'faqs' ? '/faq' : null
  switch (collection) {
    case 'pages':
      return `/${slug}`
    case 'posts':
      return `/blog/${slug}`
    case 'products':
      return `/shop/${slug}`
    case 'events':
      return `/events/${slug}`
    default:
      return null
  }
}

const reasonFor = (live: LiveDocument | undefined): InactiveEntry['reason'] => (live ? 'field-removed' : 'document-missing')

/**
 * One row per document. Cells and progress come from the same rules the
 * overview always used (`buildOverviewRows`), so a document row and the
 * per-item numbers can never disagree. Activity counts add the stored-row view.
 */
export function buildDocumentRows(args: {
  items: OverviewItemInput[]
  stored: TranslationRow[]
  targetLocales: string[]
  rules: TranslationRules
  catalogue: TranslationCatalogue
  documentHref: (collection: string, documentId: string) => string
}): DocumentRow[] {
  const base = buildOverviewRows({ items: args.items, stored: args.stored, targetLocales: args.targetLocales, rules: args.rules })
  const itemBySource = new Map(args.items.map((item) => [item.sourceId, item]))

  const storedBySource = new Map<string, TranslationRow[]>()
  for (const row of args.stored) {
    if (!args.targetLocales.includes(row.locale)) continue
    const list = storedBySource.get(row.sourceId) ?? []
    list.push(row)
    storedBySource.set(row.sourceId, list)
  }

  return base.map((row): DocumentRow => {
    const item = itemBySource.get(row.sourceId)
    const collection = item?.type ?? row.type
    const documentId = row.sourceId.slice(collection.length + 1)
    const live = args.catalogue.documents.get(sourceIdFor(collection, documentId))
    const editorHref = args.documentHref(collection, documentId)
    const countsByLocale = new Map<string, ActivityCounts>(args.targetLocales.map((code) => [code, { active: 0, outdated: 0, inactive: 0 }]))
    const inactive: InactiveEntry[] = []

    for (const stored of storedBySource.get(row.sourceId) ?? []) {
      if (!stored.value || stored.value.trim().length === 0) continue
      const activity = classifyStoredRow(stored, args.catalogue)
      if (activity === 'unknown') continue
      const counts = countsByLocale.get(stored.locale)
      if (!counts) continue
      counts[activity] += 1
      if (activity === 'inactive') {
        inactive.push({
          locale: stored.locale,
          fieldPath: stored.fieldPath,
          label: stored.fieldPath,
          reason: reasonFor(live),
          value: stored.value,
        })
      }
    }

    const total: ActivityCounts = { active: 0, outdated: 0, inactive: 0 }
    for (const counts of countsByLocale.values()) {
      total.active += counts.active
      total.outdated += counts.outdated
      total.inactive += counts.inactive
    }

    const cells: DocumentCell[] = row.cells.map((cell) => ({
      ...cell,
      counts: countsByLocale.get(cell.locale) ?? { active: 0, outdated: 0, inactive: 0 },
      ...translateTarget({ collection, documentId, locale: cell.locale, editorHref }),
    }))
    const first = cells[0]

    return {
      ...row,
      collection,
      documentId,
      url: publicPathFor(collection, live?.slug ?? null),
      counts: total,
      cells,
      inactive,
      lastSourceChange: row.updatedAt,
      href: first ? first.href : editorHref,
      mode: first ? first.mode : 'editor',
      editHref: editorHref,
    }
  })
}

/** Columns for the document table. Language columns are status cells; the rest mirror the Pages list. */
export function documentColumns(args: {
  targetLocales: string[]
  localeLabel: (code: string) => string
}): ColumnDef[] {
  return [
    { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: false },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      sortable: true,
      filterable: true,
      options: TRANSLATABLE_COLLECTIONS.map((entry) => ({ value: entry.slug, label: entry.label })),
    },
    { name: 'url', label: 'URL', type: 'text', sortable: false, filterable: false },
    ...args.targetLocales.map((code): ColumnDef => ({ name: `lang:${code}`, label: args.localeLabel(code), type: 'status', sortable: false, filterable: false })),
    { name: 'inactive', label: 'Inactive', type: 'number', sortable: false, filterable: false },
    { name: 'updatedAt', label: 'Last source change', type: 'date', sortable: true, filterable: false },
    { name: 'assignee', label: 'Assigned to', type: 'select', sortable: false, filterable: true, options: [{ value: 'me', label: 'Assigned to me' }] },
    { name: 'locale', label: 'Language', type: 'select', sortable: false, filterable: true, options: args.targetLocales.map((code) => ({ value: code, label: args.localeLabel(code) })) },
    { name: 'status', label: 'Status', type: 'select', sortable: false, filterable: true, options: TRANSLATION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })) },
  ]
}

export const DOCUMENT_DEFAULT_COLUMNS = (targetLocales: string[]): string[] => [
  'title',
  'type',
  'url',
  ...targetLocales.map((code) => `lang:${code}`),
  'inactive',
  'updatedAt',
  'assignee',
]


