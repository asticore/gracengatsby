/**
 * Filtering and sorting for the SEO audit table. Pure: the admin view calls
 * these on the rows it already loaded.
 */

import type { Status } from './analysis/types'
import type { AuditCollection, AuditRow } from './audit'

export type ScoreFilter = 'all' | 'bad' | 'ok' | 'good'
export type SortKey = 'worst' | 'best' | 'title'

export type AuditFilters = {
  collection: 'all' | AuditCollection
  score: ScoreFilter
  missingKeyphrase: boolean
  /** Case-insensitive text that must appear in one of the row's problem messages. */
  problemText: string
  sort: SortKey
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  collection: 'all',
  score: 'all',
  missingKeyphrase: false,
  problemText: '',
  sort: 'worst',
}

const SCORE_RANK: Record<Status, number> = { bad: 0, ok: 1, info: 2, good: 3 }

export function filterAuditRows(rows: AuditRow[], filters: AuditFilters): AuditRow[] {
  const needle = filters.problemText.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.collection !== 'all' && row.collection !== filters.collection) return false
    if (filters.score !== 'all' && row.seoScore !== filters.score) return false
    if (filters.missingKeyphrase && row.hasKeyphrase) return false
    if (needle && !row.problems.some((problem) => problem.toLowerCase().includes(needle))) return false
    return true
  })
}

export function sortAuditRows(rows: AuditRow[], sort: SortKey): AuditRow[] {
  const copy = [...rows]
  if (sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title))
  const direction = sort === 'worst' ? 1 : -1
  return copy.sort((a, b) => direction * (SCORE_RANK[a.seoScore] - SCORE_RANK[b.seoScore]) || a.title.localeCompare(b.title))
}
