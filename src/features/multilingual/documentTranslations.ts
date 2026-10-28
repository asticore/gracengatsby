import type { MultilingualSettings } from './settings'
import { sourceTextOf, valueAtPath, type TranslationRow } from './store'
import { fieldsForDocument, sourceIdFor, translatableSource } from './translatableFields'
import type { BlockGroup } from './blockText'
import {
  canApproveTranslation,
  computeTranslationStatus,
  effectiveAssignees,
  type TranslationStatus,
} from './translationStatus'

/**
 * The per-document view the visual builder's Translate mode works from.
 *
 * Pure: the route loads the document (as the signed-in user) and the stored
 * rows, and this shapes them for one page. The same status, assignment and
 * approval rules as the Translations screen are used, so the builder cannot
 * disagree with it about what "approved" or "assigned" means.
 *
 * Rich text (`richText` fields) is listed so the translator sees it exists, but
 * it is not counted in progress and is not editable here: it stays in the
 * default language, as the overlay does.
 */

export type DocumentTranslationField = {
  fieldPath: string
  label: string
  size: 'text' | 'long'
  richText: boolean
  /** The source text as it reads now (rich text flattened to plain text). */
  sourceText: string
  /** The stored translation, or '' when none. */
  value: string
  rowId: string | number | null
  status: TranslationStatus
  /** Users who should be working on this now (item override, else the language rules). */
  assignees: number[]
  /** Whether the viewer may press Approve for this field in this language. */
  canApprove: boolean
  /** The builder block this text belongs to, or null for a page-level field. */
  group: BlockGroup | null
}

export type DocumentTranslationLocale = {
  locale: string
  /** Approved non-rich fields, out of the non-rich fields that have source text. */
  approved: number
  total: number
  fields: DocumentTranslationField[]
}

export type DocumentTranslations = {
  collection: string
  documentId: string
  sourceId: string
  defaultLocale: string
  locales: DocumentTranslationLocale[]
}

export type DocumentTranslationInput = {
  collection: string
  documentId: string | number
  doc: Record<string, unknown>
  settings: Pick<MultilingualSettings, 'defaultLocale' | 'activeLocales' | 'requireReview' | 'adminsBypassReview' | 'translationRules'>
  rows: TranslationRow[]
  viewer: { id: number; isAdmin: boolean }
}

/**
 * Null for a collection that has no translatable fields. Otherwise the target
 * languages in configured order, each with its fields and progress.
 */
export function buildDocumentTranslations(input: DocumentTranslationInput): DocumentTranslations | null {
  const source = translatableSource(input.collection)
  if (!source) return null

  const sourceId = sourceIdFor(input.collection, input.documentId)
  const targets = input.settings.activeLocales.filter((code) => code !== input.settings.defaultLocale)

  const sourceFields = fieldsForDocument(input.collection, input.doc)
    .map((field) => ({
      ...field,
      sourceText: sourceTextOf(valueAtPath(input.doc, field.path)),
    }))
    // Nothing in the source means nothing to translate, the same filter the overview applies.
    .filter((field) => field.sourceText.length > 0)

  const locales: DocumentTranslationLocale[] = targets.map((locale) => {
    const fields: DocumentTranslationField[] = sourceFields.map((field) => {
      const row = field.richText
        ? undefined
        : input.rows.find(
            (candidate) =>
              candidate.locale === locale &&
              candidate.sourceKind === 'collection' &&
              candidate.sourceId === sourceId &&
              candidate.fieldPath === field.path,
          )
      const value = row?.value ?? ''
      const status = field.richText
        ? 'missing'
        : row
          ? computeTranslationStatus({ value, status: row.status, sourceText: row.sourceText }, field.sourceText)
          : 'missing'
      return {
        fieldPath: field.path,
        label: field.label,
        size: field.size,
        richText: Boolean(field.richText),
        sourceText: field.sourceText,
        value,
        rowId: row ? row.id : null,
        status,
        assignees: field.richText
          ? []
          : effectiveAssignees({ status, assignedTo: row?.assignedTo ?? [], locale, rules: input.settings.translationRules }),
        canApprove: field.richText
          ? false
          : canApproveTranslation({ id: input.viewer.id, isAdmin: input.viewer.isAdmin }, locale, input.settings).ok,
        group: field.group ?? null,
      }
    })

    const plain = fields.filter((field) => !field.richText)
    return {
      locale,
      approved: plain.filter((field) => field.status === 'approved').length,
      total: plain.length,
      fields,
    }
  })

  return {
    collection: input.collection,
    documentId: String(input.documentId),
    sourceId,
    defaultLocale: input.settings.defaultLocale,
    locales,
  }
}
