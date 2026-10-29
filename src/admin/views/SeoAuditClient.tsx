'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
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
const STATUS_KEY: Record<Status, UiStringKey | null> = { good: 'se.lit.good', ok: 'se.lit.could_be_better', bad: 'se.lit.needs_work', info: null }
const SCORE_OPTIONS: { value: ScoreFilter; labelKey: UiStringKey }[] = [
  { value: 'all', labelKey: 'se.lit.any_score' },
  { value: 'bad', labelKey: 'se.lit.needs_work' },
  { value: 'ok', labelKey: 'se.lit.could_be_better' },
  { value: 'good', labelKey: 'se.lit.good' },
]
const SORT_OPTIONS: { value: SortKey; labelKey: UiStringKey }[] = [
  { value: 'worst', labelKey: 'se.lit.needs_work_first' },
  { value: 'best', labelKey: 'se.lit.good_first' },
  { value: 'title', labelKey: 'se.lit.title_a_to_z' },
]
const PROBLEMS_SHOWN = 3

function StatusDot({ status }: { status: Status }) {
  const t = useAdminT()
  const text = STATUS_KEY[status] ? t(STATUS_KEY[status]) : 'For information'
  return <span className={`sa-dot sa-dot--${status}`} role="img" aria-label={text} title={text} />
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
  const t = useAdminT()
  return (
    <div className="sa-tiles">
      <SummaryTile value={summary.total} label={t('se.lit.items_checked')} />
      <SummaryTile value={summary.good} label={t('se.lit.good')} />
      <SummaryTile value={summary.ok} label={t('se.lit.could_be_better')} />
      <SummaryTile value={summary.bad} label={t('se.lit.needs_work')} />
      <SummaryTile value={summary.missingKeyphrase} label={t('se.lit.no_focus_keyphrase')} />
      <SummaryTile value={summary.missingMetaDescription} label={t('se.lit.no_meta_description')} />
      <SummaryTile value={summary.noIndex} label={t('se.lit.hidden_from_search_engines')} />
    </div>
  )
}

function ProblemList({ problems }: { problems: string[] }) {
  const t = useAdminT()
  if (problems.length === 0) return <span className="sa-muted">{t('se.lit.none')}</span>
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
  const t = useAdminT()
  const router = useRouter()
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead>
          <tr>
            <th scope="col">{t('se.lit.score')}</th>
            <th scope="col">{t('se.lit.readability')}</th>
            <th scope="col">{t('se.lit.title')}</th>
            <th scope="col">{t('se.lit.type')}</th>
            <th scope="col">{t('se.lit.focus_keyphrase')}</th>
            <th scope="col">{t('se.lit.problems')}</th>
            <th scope="col">{t('se.lit.search_engines')}</th>
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
              <td>{row.hasKeyphrase ? t('se.lit.set') : <span className="sa-missing">{t('se.lit.missing')}</span>}</td>
              <td>
                <ProblemList problems={row.problems} />
              </td>
              <td>{row.noIndex ? <span className="sa-missing">{t('se.lit.hidden')}</span> : 'Shown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilterControls({ filters, collections, onChange }: { filters: AuditFilters; collections: AuditCollection[]; onChange: (patch: Partial<AuditFilters>) => void }) {
  const t = useAdminT()
  return (
    <div className="sa-filters">
      <label className="sa-field">
        <span className="sa-field__label">{t('se.lit.place')}</span>
        <select value={filters.collection} onChange={(e) => onChange({ collection: e.target.value as AuditFilters['collection'] })}>
          <option value="all">{t('se.lit.all_places')}</option>
          {collections.map((key) => (
            <option key={key} value={key}>
              {COLLECTION_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-field">
        <span className="sa-field__label">{t('se.lit.score')}</span>
        <select value={filters.score} onChange={(e) => onChange({ score: e.target.value as ScoreFilter })}>
          {SCORE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-field">
        <span className="sa-field__label">{t('se.lit.problem_contains')}</span>
        <input type="text" value={filters.problemText} placeholder={t('se.lit.for_example_meta_description')} onChange={(e) => onChange({ problemText: e.target.value })} />
      </label>
      <label className="sa-field">
        <span className="sa-field__label">{t('se.lit.sort_by')}</span>
        <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-check">
        <input type="checkbox" checked={filters.missingKeyphrase} onChange={(e) => onChange({ missingKeyphrase: e.target.checked })} />
        <span>{t('se.lit.missing_focus_keyphrase_only')}</span>
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
  const t = useAdminT()
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
        <h1 className="sa-title-main">{t('se.lit.seo_audit')}</h1>
        <p className="sa-intro">
          Checks every published page, post, product and event for search engine and readability problems. Click a row to edit it.
          {AUDIT_COLLECTIONS.length === collections.length ? '' : ' Only the places you can edit or read are shown.'}
        </p>
      </header>

      {state.status === 'loading' && <p className="sa-muted">{t('se.lit.checking_content')}</p>}
      {state.status === 'error' && <p className="sa-alert" role="alert">{t('se.lit.the_audit_could_not_load_refresh_the_pag')}</p>}

      {state.status === 'ready' && (
        <>
          <SummaryCards summary={state.data.summary} />

          <CollapsibleCard id="seo-audit-filters" title={t('se.lit.filters')}>
            <FilterControls filters={filters} collections={collections} onChange={onChange} />
          </CollapsibleCard>

          <section className="sa-results" aria-label={t('se.lit.audit_results')}>
            <h2 className="sa-results__heading">Results ({visible.length})</h2>
            {state.data.rows.length === 0 && <p className="sa-muted">{t('se.lit.nothing_to_check_yet_publish_a_page_post')}</p>}
            {state.data.rows.length > 0 && visible.length === 0 && <p className="sa-muted">{t('se.lit.no_items_match_these_filters')}</p>}
            {visible.length > 0 && <AuditTable rows={visible} />}
          </section>
        </>
      )}
    </div>
  )
}
