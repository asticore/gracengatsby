/**
 * The Templates hub: one list of site templates, page templates and reusable sections.
 *
 * Pure functions only (no React, no server imports), so the admin view, the client
 * toolbar and the unit tests all share one definition of a row, its filters and its sort.
 */

import type { ColumnDef, ListFilter } from '@/admin/list/listQuery'
import { adminCollectionPath } from '@/admin/adminPaths'
import { summariseConditions } from '@/features/siteTemplates/conditionsSummary'
import { KIND_LABELS, PUBLIC_PREVIEW_PATH, SITE_TEMPLATE_KINDS, type SiteTemplateKind } from '@/features/siteTemplates/kinds'

export type HubCollection = 'site-templates' | 'page-templates' | 'reusable-sections'

/** Type values for the two non-site collections. Site templates use their kind (header, single-post, ...). */
export const PAGE_TEMPLATE_TYPE = 'page-template'
export const REUSABLE_SECTION_TYPE = 'reusable-section'

export type HubStatus = 'on' | 'off' | 'available'

/** The fields of a stored template the hub reads. Each collection is read at depth 0. */
export type HubSourceDoc = {
  id: number | string
  name?: string | null
  kind?: string | null
  enabled?: boolean | null
  priority?: number | null
  conditions?: unknown
  blocks?: unknown[] | null
  updatedAt?: string | null
}

export type HubRow = {
  key: string
  collection: HubCollection
  id: number | string
  name: string
  type: string
  typeLabel: string
  status: HubStatus
  statusLabel: string
  where: string
  priority: number | null
  updatedAt: string | null
  editHref: string
  visualHref: string | null
  previewHref: string | null
  /** Site templates only: the on/off switch in the list can change it. */
  toggleable: boolean
}

export const HUB_DEFAULT_SORT = '-updatedAt'
export const HUB_DEFAULT_COLUMNS = ['name', 'type', 'status', 'where', 'priority', 'updatedAt']
const HUB_SORT_FIELDS = ['name', 'type', 'status', 'priority', 'updatedAt'] as const

const STATUS_LABELS: Record<HubStatus, string> = { on: 'On', off: 'Off', available: 'Available' }
const PAGE_TEMPLATE_WHERE = 'Starter for new pages'
const REUSABLE_SECTION_WHERE = 'Inserted manually'

/** Type labels for every hub type, in the order the type filter lists them. */
export const HUB_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(SITE_TEMPLATE_KINDS.map((kind) => [kind, KIND_LABELS[kind]])),
  [PAGE_TEMPLATE_TYPE]: 'Page template',
  [REUSABLE_SECTION_TYPE]: 'Reusable section',
}

export const HUB_COLUMNS: ColumnDef[] = [
  { name: 'name', label: 'Name', type: 'text', sortable: true, filterable: false },
  { name: 'type', label: 'Type', type: 'select', sortable: true, filterable: true, options: Object.entries(HUB_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
  { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true, options: (['on', 'off', 'available'] as const).map((value) => ({ value, label: STATUS_LABELS[value] })) },
  { name: 'where', label: 'Where it applies', type: 'text', sortable: false, filterable: false },
  { name: 'priority', label: 'Priority', type: 'number', sortable: true, filterable: false },
  { name: 'updatedAt', label: 'Updated', type: 'date', sortable: true, filterable: false },
]

const siteRow = (doc: HubSourceDoc, kind: SiteTemplateKind | string): HubRow => {
  const enabled = doc.enabled !== false
  const slug: HubCollection = 'site-templates'
  const publicPath = PUBLIC_PREVIEW_PATH[kind as SiteTemplateKind]
  return {
    key: `${slug}:${doc.id}`,
    collection: slug,
    id: doc.id,
    name: doc.name || `Untitled ${doc.id}`,
    type: kind,
    typeLabel: HUB_TYPE_LABELS[kind] ?? kind,
    status: enabled ? 'on' : 'off',
    statusLabel: enabled ? STATUS_LABELS.on : STATUS_LABELS.off,
    where: summariseConditions(doc.conditions),
    priority: typeof doc.priority === 'number' ? doc.priority : 0,
    updatedAt: doc.updatedAt ?? null,
    editHref: `${adminCollectionPath(slug)}/${doc.id}`,
    visualHref: `/admin/visual-editor/collection/${slug}/${doc.id}`,
    previewHref: publicPath ?? null,
    toggleable: true,
  }
}

const plainRow = (doc: HubSourceDoc, collection: 'page-templates' | 'reusable-sections'): HubRow => {
  const isPage = collection === 'page-templates'
  return {
    key: `${collection}:${doc.id}`,
    collection,
    id: doc.id,
    name: doc.name || `Untitled ${doc.id}`,
    type: isPage ? PAGE_TEMPLATE_TYPE : REUSABLE_SECTION_TYPE,
    typeLabel: isPage ? HUB_TYPE_LABELS[PAGE_TEMPLATE_TYPE] : HUB_TYPE_LABELS[REUSABLE_SECTION_TYPE],
    status: 'available',
    statusLabel: STATUS_LABELS.available,
    where: isPage ? PAGE_TEMPLATE_WHERE : REUSABLE_SECTION_WHERE,
    priority: null,
    updatedAt: doc.updatedAt ?? null,
    editHref: `${adminCollectionPath(collection)}/${doc.id}`,
    // Reusable sections have no visual builder entry (not in VISUAL_EDITOR_SURFACES), so no link.
    visualHref: isPage ? `/admin/visual-editor/collection/${collection}/${doc.id}` : null,
    previewHref: null,
    toggleable: false,
  }
}

/** One row per template in any of the three collections. Missing lists (no access) are passed as []. */
export function buildHubRows(input: {
  siteTemplates?: HubSourceDoc[]
  pageTemplates?: HubSourceDoc[]
  reusableSections?: HubSourceDoc[]
}): HubRow[] {
  return [
    ...(input.siteTemplates ?? []).map((doc) => siteRow(doc, typeof doc.kind === 'string' ? doc.kind : '')),
    ...(input.pageTemplates ?? []).map((doc) => plainRow(doc, 'page-templates')),
    ...(input.reusableSections ?? []).map((doc) => plainRow(doc, 'reusable-sections')),
  ]
}

/** Does a filter value name this type, by its key or its label (either case)? */
function matchesType(row: HubRow, value: string): boolean {
  const v = value.trim().toLowerCase()
  return row.type.toLowerCase() === v || row.typeLabel.toLowerCase() === v
}

function matchesStatus(row: HubRow, value: string): boolean {
  const v = value.trim().toLowerCase()
  return row.status === v || row.statusLabel.toLowerCase() === v
}

/**
 * Apply the list's search box and filters. Filters on `type` and `status` (equals / not equals / contains)
 * are honoured; any other field or operator is ignored, because the hub has no such column.
 */
export function filterHubRows(rows: HubRow[], filters: ListFilter[], q: string): HubRow[] {
  const needle = q.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle) {
      const haystack = `${row.name} ${row.typeLabel} ${row.where}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    for (const filter of filters) {
      const test = filter.field === 'type' ? matchesType : filter.field === 'status' ? matchesStatus : null
      if (!test) continue
      if (filter.op === 'equals' && !test(row, filter.value)) return false
      if (filter.op === 'not_equals' && test(row, filter.value)) return false
      if (filter.op === 'contains' && !(filter.field === 'type' ? row.typeLabel : row.statusLabel).toLowerCase().includes(filter.value.trim().toLowerCase())) return false
    }
    return true
  })
}

/** Sort by one of the sortable columns, `-` for descending. Unknown sorts fall back to the default; ties keep key order. */
export function sortHubRows(rows: HubRow[], sort: string): HubRow[] {
  const known = (HUB_SORT_FIELDS as readonly string[]).includes(sort.replace(/^-/, ''))
  const column = known ? sort.replace(/^-/, '') : HUB_DEFAULT_SORT.slice(1)
  const direction = known ? (sort.startsWith('-') ? -1 : 1) : -1

  const valueOf = (row: HubRow): string | number | null => {
    switch (column) {
      case 'name': return row.name.toLowerCase()
      case 'type': return row.typeLabel.toLowerCase()
      case 'status': return row.statusLabel.toLowerCase()
      case 'priority': return row.priority
      default: return row.updatedAt
    }
  }

  return [...rows].sort((a, b) => {
    const x = valueOf(a)
    const y = valueOf(b)
    // Missing values (no priority or date on a page template or section) sort last whichever way round.
    if (x === null && y === null) return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    if (x === null) return 1
    if (y === null) return -1
    if (x < y) return -1 * direction
    if (x > y) return 1 * direction
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

/** One page of rows and the page count (at least 1). Page is 1-based and clamped into range. */
export function pageHubRows(rows: HubRow[], page: number, limit: number): { rows: HubRow[]; totalPages: number; page: number } {
  const size = Math.max(1, limit)
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  return { rows: rows.slice((current - 1) * size, current * size), totalPages, page: current }
}
