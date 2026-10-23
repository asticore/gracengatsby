'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { Status } from '@/features/seo/analysis/types'
import { AUDIT_COLLECTIONS, type AuditCollection, type AuditRow, type AuditSummary } from '@/features/seo/audit'
import { DEFAULT_AUDIT_FILTERS, filterAuditRows, sortAuditRows, type AuditFilters, type ScoreFilter, type SortKey } from '@/features/seo/auditFilters'
import './seo-audit.css'

type AuditResponse = { rows: AuditRow[]; summary: AuditSummary }
type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AuditResponse }

const COLLECTION_LABEL: Record<AuditCollection, string> = { pages: 'Pages', posts: 'Blog', products: 'Products', events: 'Events' }
const TYPE_LABEL: Record<AuditCollection, string> = { pages: 'Page', posts: 'Post', products: 'Product', events: 'Event' }
const STATUS_LABEL: Record<Status, string> = { good: 'Good', ok: 'Could be better', bad: 'Needs work', info: 'For information' }
const SCORE_OPTIONS: { value: ScoreFilter; label: string }[] = [
  { value: 'all', label: 'Any score' },
  { value: 'bad', label: 'Needs work' },
  { value: 'ok', label: 'Could be better' },
  { value: 'good', label: 'Good' },
]
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'worst', label: 'Needs work first' },
  { value: 'best', label: 'Good first' },
  { value: 'title', label: 'Title A to Z' },
]
const PROBLEMS_SHOWN = 3

function StatusDot({ status }: { status: Status }) {
  return <span className={`sa-dot sa-dot--${status}`} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />
}

function SummaryTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="sa-tile">
      <div className="sa-tile__value">{value}</div>
      <div className="sa-tile__label">{label}</div>
    </div>
  )
}

function SummaryCards({ summary }: { summary: AuditSummary }) {
  return (
    <div className="sa-tiles">
      <SummaryTile value={summary.total} label="Items checked" />
      <SummaryTile value={summary.good} label="Good" />
      <SummaryTile value={summary.ok} label="Could be better" />
      <SummaryTile value={summary.bad} label="Needs work" />
      <SummaryTile value={summary.missingKeyphrase} label="No focus keyphrase" />
      <SummaryTile value={summary.missingMetaDescription} label="No meta description" />
      <SummaryTile value={summary.noIndex} label="Hidden from search engines" />
    </div>
  )
}

function ProblemList({ problems }: { problems: string[] }) {
  if (problems.length === 0) return <span className="sa-muted">None</span>
  const shown = problems.slice(0, PROBLEMS_SHOWN)
  const extra = problems.length - shown.length
  return (
    <ul className="sa-problems">
      {shown.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
      {extra > 0 && <li className="sa-muted">and {extra} more</li>}
    </ul>
  )
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  const router = useRouter()
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            <th scope="col">Score</th>
            <th scope="col">Readability</th>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Focus keyphrase</th>
            <th scope="col">Problems</th>
            <th scope="col">Search engines</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.collection}-${row.id}`}
              className="sa-row"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) return
                router.push(row.editHref)
              }}
            >
              <td>
                <StatusDot status={row.seoScore} />
              </td>
              <td>
                <StatusDot status={row.readabilityScore} />
              </td>
              <td>
                <Link href={row.editHref} className="sa-title">
                  {row.title || '(untitled)'}
                </Link>
                {row.slug && <div className="sa-slug">/{row.slug}</div>}
              </td>
              <td>{TYPE_LABEL[row.collection]}</td>
              <td>{row.hasKeyphrase ? 'Set' : <span className="sa-missing">Missing</span>}</td>
              <td>
                <ProblemList problems={row.problems} />
              </td>
              <td>{row.noIndex ? <span className="sa-missing">Hidden</span> : 'Shown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilterControls({ filters, collections, onChange }: { filters: AuditFilters; collections: AuditCollection[]; onChange: (patch: Partial<AuditFilters>) => void }) {
  return (
    <div className="sa-filters">
      <label className="sa-field">
        <span className="sa-field__label">Place</span>
        <select value={filters.collection} onChange={(e) => onChange({ collection: e.target.value as AuditFilters['collection'] })}>
          <option value="all">All places</option>
          {collections.map((key) => (
            <option key={key} value={key}>
              {COLLECTION_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-field">
        <span className="sa-field__label">Score</span>
        <select value={filters.score} onChange={(e) => onChange({ score: e.target.value as ScoreFilter })}>
          {SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-field">
        <span className="sa-field__label">Problem contains</span>
        <input type="text" value={filters.problemText} placeholder="for example: meta description" onChange={(e) => onChange({ problemText: e.target.value })} />
      </label>
      <label className="sa-field">
        <span className="sa-field__label">Sort by</span>
        <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-check">
        <input type="checkbox" checked={filters.missingKeyphrase} onChange={(e) => onChange({ missingKeyphrase: e.target.checked })} />
        <span>Missing focus keyphrase only</span>
      </label>
    </div>
  )
}

function useAuditData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin-seo-audit', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Audit request failed: ${res.status}`)
        return (await res.json()) as AuditResponse
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export function SeoAuditClient({ collections }: { collections: AuditCollection[] }) {
  const state = useAuditData()
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS)
  const onChange = (patch: Partial<AuditFilters>) => setFilters((current) => ({ ...current, ...patch }))

  const visible = useMemo(
    () => (state.status === 'ready' ? sortAuditRows(filterAuditRows(state.data.rows, filters), filters.sort) : []),
    [state, filters],
  )

  return (
    <div className="sa-page">
      <header className="sa-header">
        <h1 className="sa-title-main">SEO audit</h1>
        <p className="sa-intro">
          Checks every published page, post, product and event for search engine and readability problems. Click a row to edit it.
          {AUDIT_COLLECTIONS.length === collections.length ? '' : ' Only the places you can edit or read are shown.'}
        </p>
      </header>

      {state.status === 'loading' && <p className="sa-muted">Checking content...</p>}
      {state.status === 'error' && <p className="sa-alert" role="alert">The audit could not load. Refresh the page to try again.</p>}

      {state.status === 'ready' && (
        <>
          <SummaryCards summary={state.data.summary} />

          <CollapsibleCard id="seo-audit-filters" title="Filters">
            <FilterControls filters={filters} collections={collections} onChange={onChange} />
          </CollapsibleCard>

          <section className="sa-results" aria-label="Audit results">
            <h2 className="sa-results__heading">Results ({visible.length})</h2>
            {state.data.rows.length === 0 && <p className="sa-muted">Nothing to check yet. Publish a page, post, product or event.</p>}
            {state.data.rows.length > 0 && visible.length === 0 && <p className="sa-muted">No items match these filters.</p>}
            {visible.length > 0 && <AuditTable rows={visible} />}
          </section>
        </>
      )}
    </div>
  )
}
