/**
 * The Translations overview: one row per translatable item, one status per language.
 *
 * Pure, like the Templates hub rows. The view loads the items and their stored
 * translations; this file decides what a row says, what the filters keep and
 * how the table is sorted and paged. Keeping it here means the table and the
 * bulk actions agree on what "needs translation" means.
 */

import type { ColumnDef, ListFilter } from '@/admin/list/listQuery'

import { computeTranslationStatus, effectiveAssignees, STATUS_LABELS, TRANSLATION_STATUSES, worstStatus, type TranslationRules, type TranslationStatus } from './translationStatus'
import { translationKey, type TranslationKind, type TranslationRow } from './store'

export type OverviewField = {
  fieldPath: string
  label: string
  /** The source text as it reads now. */
  sourceText: string
}

/** One translatable thing: a document (pages, posts, ...) or one interface string. */
export type OverviewItemInput = {
  sourceKind: TranslationKind
  sourceId: string
  /** Collection slug, or 'interface'. */
  type: string
  typeLabel: string
  title: string
  updatedAt: string | null
  editHref: string | null
  fields: OverviewField[]
}

export type OverviewCell = {
  locale: string
  /** The least-finished status across this item's fields in this language. */
  status: TranslationStatus
  approved: number
  total: number
  /** Who should be working on it now. Empty when nothing is left to do. */
  assignees: number[]
}

export type OverviewRow = {
  key: string
  sourceKind: TranslationKind
  sourceId: string
  type: string
  typeLabel: string
  title: string
  updatedAt: string | null
  editHref: string | null
  fieldCount: number
  cells: OverviewCell[]
  /** Percentage of field-language pairs that are approved, 0-100. */
  progress: number
  /** Everyone assigned to something on this item, across languages. */
  assignees: number[]
}

export const OVERVIEW_DEFAULT_SORT = '-updatedAt'
const SORT_FIELDS = ['title', 'type', 'updatedAt', 'progress'] as const

export const itemKey = (sourceKind: TranslationKind, sourceId: string): string => `${sourceKind}:${sourceId}`

export function buildOverviewRows(args: {
  items: OverviewItemInput[]
  stored: TranslationRow[]
  targetLocales: string[]
  rules: TranslationRules
}): OverviewRow[] {
  const byKey = new Map(args.stored.map((row) => [translationKey(row), row]))

  return args.items.map((item) => {
    const cells: OverviewCell[] = args.targetLocales.map((locale) => {
      const statuses: TranslationStatus[] = []
      const assignees = new Set<number>()
      let approved = 0

      for (const field of item.fields) {
        const row = byKey.get(translationKey({ locale, sourceKind: item.sourceKind, sourceId: item.sourceId, fieldPath: field.fieldPath }))
        const status = computeTranslationStatus(
          { value: row?.value ?? null, status: row?.status ?? null, sourceText: row?.sourceText ?? null },
          field.sourceText,
        )
        statuses.push(status)
        if (status === 'approved') approved += 1
        for (const id of effectiveAssignees({ status, assignedTo: row?.assignedTo, locale, rules: args.rules })) {
          assignees.add(id)
        }
      }

      return {
        locale,
        status: worstStatus(statuses),
        approved,
        total: item.fields.length,
        assignees: [...assignees],
      }
    })

    const pairs = cells.reduce((sum, cell) => sum + cell.total, 0)
    const done = cells.reduce((sum, cell) => sum + cell.approved, 0)
    const assignees = new Set(cells.flatMap((cell) => cell.assignees))

    return {
      key: itemKey(item.sourceKind, item.sourceId),
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      type: item.type,
      typeLabel: item.typeLabel,
      title: item.title,
      updatedAt: item.updatedAt,
      editHref: item.editHref,
      fieldCount: item.fields.length,
      cells,
      progress: pairs === 0 ? 100 : Math.round((done / pairs) * 100),
      assignees: [...assignees],
    }
  })
}

/** The status for one language, or the worst across all languages when none is chosen. */
export function statusOf(row: OverviewRow, locale: string | null): TranslationStatus {
  if (locale) return row.cells.find((cell) => cell.locale === locale)?.status ?? 'approved'
  return worstStatus(row.cells.map((cell) => cell.status))
}

/**
 * Applies the search box and the filter chips.
 *
 * Filters: `type` (equals), `locale` (equals - narrows `status` to that
 * language), `status` (equals / not_equals) and `assignee` (equals a user id,
 * `me` being resolved by the caller). Anything else is ignored, as on the hub.
 */
export function filterOverviewRows<T extends OverviewRow>(
  rows: T[],
  filters: ListFilter[],
  q: string,
  viewerId: number | null,
): T[] {
  const needle = q.trim().toLowerCase()
  const locale = filters.find((filter) => filter.field === 'locale' && filter.op === 'equals')?.value ?? null

  return rows.filter((row) => {
    if (needle && !`${row.title} ${row.typeLabel}`.toLowerCase().includes(needle)) return false

    for (const filter of filters) {
      const value = filter.value.trim()
      if (filter.field === 'type') {
        const matches = row.type === value || row.typeLabel.toLowerCase() === value.toLowerCase()
        if (filter.op === 'equals' && !matches) return false
        if (filter.op === 'not_equals' && matches) return false
      }
      if (filter.field === 'status') {
        const matches = statusOf(row, locale) === value
        if (filter.op === 'equals' && !matches) return false
        if (filter.op === 'not_equals' && matches) return false
      }
      if (filter.field === 'assignee' && filter.op === 'equals') {
        const id = Number(value)
        if (!Number.isInteger(id) || id <= 0) {
          // "me" with no signed-in viewer matches nothing.
          if (value === 'me' && viewerId !== null) {
            if (!row.assignees.includes(viewerId)) return false
          } else {
            return false
          }
        } else if (!row.assignees.includes(id)) {
          return false
        }
      }
    }
    return true
  })
}

/** Sort by a column, `-` for descending. Unknown columns fall back to the default. */
export function sortOverviewRows<T extends OverviewRow>(rows: T[], sort: string): T[] {
  const known = (SORT_FIELDS as readonly string[]).includes(sort.replace(/^-/, ''))
  const column = known ? sort.replace(/^-/, '') : OVERVIEW_DEFAULT_SORT.slice(1)
  const direction = known && sort.startsWith('-') ? -1 : known ? 1 : -1

  const valueOf = (row: OverviewRow): string | number | null => {
    switch (column) {
      case 'title':
        return row.title.toLowerCase()
      case 'type':
        return row.typeLabel.toLowerCase()
      case 'progress':
        return row.progress
      default:
        return row.updatedAt
    }
  }

  return [...rows].sort((a, b) => {
    const x = valueOf(a)
    const y = valueOf(b)
    if (x === null && y === null) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    if (x === null) return 1
    if (y === null) return -1
    if (x < y) return -1 * direction
    if (x > y) return 1 * direction
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

export function pageOverviewRows<T extends OverviewRow>(rows: T[], page: number, limit: number): { rows: T[]; totalPages: number; page: number } {
  const size = Math.max(1, limit)
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  return { rows: rows.slice((current - 1) * size, current * size), totalPages, page: current }
}

/** Columns for the list toolbar: fixed ones, plus one status column per target language. */
export function overviewColumns(args: { targetLocales: string[]; typeOptions: { value: string; label: string }[]; localeLabel: (code: string) => string }): ColumnDef[] {
  return [
    { name: 'title', label: 'Item', type: 'text', sortable: true, filterable: false },
    { name: 'type', label: 'Type', type: 'select', sortable: true, filterable: true, options: args.typeOptions },
    { name: 'locale', label: 'Language', type: 'select', sortable: false, filterable: true, options: args.targetLocales.map((code) => ({ value: code, label: args.localeLabel(code) })) },
    { name: 'status', label: 'Status', type: 'select', sortable: false, filterable: true, options: TRANSLATION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })) },
    { name: 'assignee', label: 'Assigned to', type: 'select', sortable: false, filterable: true, options: [{ value: 'me', label: 'Assigned to me' }] },
    { name: 'progress', label: 'Progress', type: 'number', sortable: true, filterable: false },
    { name: 'updatedAt', label: 'Updated', type: 'date', sortable: true, filterable: false },
    ...args.targetLocales.map((code) => ({
      name: `lang:${code}`,
      label: args.localeLabel(code),
      type: 'status',
      sortable: false,
      filterable: false,
    })),
  ]
}

export const OVERVIEW_DEFAULT_COLUMNS = (targetLocales: string[]): string[] => [
  'title',
  'type',
  ...targetLocales.map((code) => `lang:${code}`),
  'progress',
  'assignee',
  'updatedAt',
]
