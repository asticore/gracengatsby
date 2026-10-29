'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import React, { useEffect, useMemo, useState } from 'react'
import type { ConsentLogRecord, ConsentSummary } from '@/features/consent/logStats'

type ApiResponse = {
  rows: ConsentLogRecord[]
  page: number
  limit: number
  total: number
  summary: ConsentSummary & { days: number; truncated: boolean }
}

type Filters = { from: string; to: string; category: string; state: string }
const NO_FILTERS: Filters = { from: '', to: '', category: '', state: 'granted' }
const PAGE_SIZE = 25

const CATEGORY_KEYS: Record<string, UiStringKey> = {
  necessary: 'cc.lit.necessary',
  preferences: 'cc.lit.preferences',
  analytics: 'cc.lit.analytics',
  marketing: 'cc.lit.marketing',
}
const OUTCOME_KEYS: Record<string, UiStringKey | 'Custom'> = { accepted: 'cc.lit.accepted_all', rejected: 'cc.lit.rejected_all', custom: 'Custom' }

const queryFor = (filters: Filters, extra: Record<string, string>): string => {
  const params = new URLSearchParams(extra)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.category) {
    params.set('category', filters.category)
    params.set('state', filters.state)
  }
  return params.toString()
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

/** Bars for the share of each day's decisions that accepted everything. Neutral colours; light/dark via CSS. */
export const AcceptanceChart: React.FC<{ daily: ConsentSummary['daily'] }> = ({ daily }) => {
  const width = 600
  const height = 140
  const left = 34
  const bottom = 20
  const top = 8
  const plotWidth = width - left - 4
  const plotHeight = height - bottom - top
  const step = plotWidth / Math.max(daily.length, 1)
  const barWidth = Math.max(step - 2, 1)
  const withData = daily.filter((day) => day.total > 0)
  const summary = withData.length
    ? `Acceptance rate by day, last ${daily.length} days. ${withData.length} days had decisions.`
    : `Acceptance rate by day, last ${daily.length} days. No decisions yet.`

  return (
    <svg className="cc-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} preserveAspectRatio="none">
      {[0, 0.5, 1].map((tick) => {
        const y = top + plotHeight * (1 - tick)
        return (
          <g key={tick}>
            <line className="cc-chart__grid" x1={left} x2={width - 4} y1={y} y2={y} />
            <text className="cc-chart__axis" x={left - 4} y={y + 3} textAnchor="end">
              {percent(tick)}
            </text>
          </g>
        )
      })}
      {daily.map((day, index) => {
        const x = left + index * step + 1
        if (day.rate === null) {
          return (
            <rect key={day.date} className="cc-chart__empty" x={x} y={top + plotHeight - 1} width={barWidth} height={1}>
              <title>{`${day.date}: no decisions`}</title>
            </rect>
          )
        }
        const barHeight = Math.max(day.rate * plotHeight, 1)
        return (
          <rect key={day.date} className="cc-chart__bar" x={x} y={top + plotHeight - barHeight} width={barWidth} height={barHeight}>
            <title>{`${day.date}: ${percent(day.rate)} accepted all (${day.accepted} of ${day.total})`}</title>
          </rect>
        )
      })}
      <text className="cc-chart__axis" x={left} y={height - 5}>
        {daily[0]?.date.slice(5) ?? ''}
      </text>
      <text className="cc-chart__axis" x={width - 4} y={height - 5} textAnchor="end">
        {daily[daily.length - 1]?.date.slice(5) ?? ''}
      </text>
    </svg>
  )
}

const Tile: React.FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <div className="cc-tile">
    <p className="cc-tile__value">{value.toLocaleString()}</p>
    <p className="cc-tile__label">{label}</p>
    {hint ? <p className="cc-tile__hint">{hint}</p> : null}
  </div>
)

const yesNo = (value: boolean, yes: string, no: string) => (value ? yes : no)

export const CookieConsentLog: React.FC<{ logEnabled: boolean }> = ({ logEnabled }) => {
  const t = useAdminT()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [applied, setApplied] = useState<Filters>(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Callers set loading and error before changing the query, so the effect below only starts the fetch.
  // State is set only inside promise callbacks, never synchronously in the effect body.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    fetch(`/api/admin-consent-log?${queryFor(applied, { page: String(page), limit: String(PAGE_SIZE) })}`, {
      credentials: 'include',
      signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 403 ? t('cc.lit.only_administrators_can_read_the_consent') : 'The consent log could not be loaded.')
        return response.json() as Promise<ApiResponse>
      })
      .then((next) => {
        if (!signal.aborted) setData(next)
      })
      .catch((caught: unknown) => {
        if (signal.aborted) return
        setError(caught instanceof Error ? caught.message : 'The consent log could not be loaded.')
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [applied, page, t])

  const csvHref = useMemo(() => `/api/admin-consent-log?${queryFor(applied, { format: 'csv' })}`, [applied])
  const pages = data ? Math.max(Math.ceil(data.total / data.limit), 1) : 1
  const dateOrderBad = Boolean(filters.from && filters.to && filters.from > filters.to)

  const startRequest = (nextFilters: Filters, nextPage: number) => {
    setLoading(true)
    setError(null)
    setPage(nextPage)
    setApplied(nextFilters)
  }

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    if (dateOrderBad) return
    startRequest(filters, 1)
  }

  const summary = data?.summary

  return (
    <div className="cc-log">
      {!logEnabled ? (
        <p className="cc-note cc-note--warn">
          Logging is switched off in the Banner settings (Keep an anonymised log of consent choices), so no new choices are being
          recorded. Existing entries are shown below.
        </p>
      ) : null}
      <p className="cc-note">
        Each entry is one visitor decision: a random id, the policy version, the choices and the time. IP addresses and browsers are never
        stored, so they cannot be shown here. The country appears only when you turn on country logging.
      </p>

      <h2 className="cc-heading">Last {summary?.days ?? 30} days</h2>
      <div className="cc-tiles">
        <Tile label={t('cc.lit.accepted_all')} value={summary?.accepted ?? 0} />
        <Tile label={t('cc.lit.rejected_all')} value={summary?.rejected ?? 0} />
        <Tile label={t('cc.lit.custom_choices')} value={summary?.custom ?? 0} />
        <Tile label={t('cc.lit.total_decisions')} value={summary?.total ?? 0} />
      </div>
      {summary?.truncated ? <p className="cc-note">{t('cc.lit.there_are_more_than_5_000_decisions_in_t')}</p> : null}

      <h3 className="cc-subheading">{t('cc.lit.acceptance_rate_by_day')}</h3>
      <p className="cc-note">{t('cc.lit.share_of_each_day_rsquo_s_decisions_that')}</p>
      {summary ? <AcceptanceChart daily={summary.daily} /> : <div className="cc-chart cc-chart--loading" />}

      <h2 className="cc-heading">{t('cc.lit.recent_decisions')}</h2>
      <form className="cc-filters" onSubmit={apply}>
        <label className="cc-field">
          <span>{t('cc.lit.from')}</span>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label className="cc-field">
          <span>{t('cc.lit.to')}</span>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <label className="cc-field">
          <span>{t('cc.lit.category')}</span>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">{t('cc.lit.any')}</option>
            <option value="preferences">{t('cc.lit.preferences')}</option>
            <option value="analytics">{t('cc.lit.analytics')}</option>
            <option value="marketing">{t('cc.lit.marketing')}</option>
          </select>
        </label>
        <label className="cc-field">
          <span>{t('cc.lit.choice')}</span>
          <select value={filters.state} disabled={!filters.category} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>
            <option value="granted">{t('cc.lit.allowed')}</option>
            <option value="refused">{t('cc.lit.refused')}</option>
          </select>
        </label>
        <div className="cc-filters__actions">
          <button type="submit" className="cc-button cc-button--primary" disabled={dateOrderBad}>
            Apply
          </button>
          <button
            type="button"
            className="cc-button"
            onClick={() => {
              setFilters(NO_FILTERS)
              startRequest(NO_FILTERS, 1)
            }}
          >
            Clear
          </button>
          <a className="cc-button" href={csvHref} download="consent-log.csv">
            Export CSV
          </a>
        </div>
        {dateOrderBad ? (
          <p className="cc-error" role="alert">
            The start date is after the end date.
          </p>
        ) : null}
      </form>

      {error ? (
        <p className="cc-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="cc-table-wrap" aria-busy={loading}>
        <table className="cc-table">
          <caption className="cc-sr">{t('cc.lit.recent_cookie_consent_decisions')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('cc.lit.date')}</th>
              <th scope="col">{t('cc.lit.country')}</th>
              <th scope="col">{t('cc.lit.policy_version')}</th>
              <th scope="col">{t('cc.lit.necessary')}</th>
              <th scope="col">{t('cc.lit.preferences')}</th>
              <th scope="col">{t('cc.lit.analytics')}</th>
              <th scope="col">{t('cc.lit.marketing')}</th>
              <th scope="col">{t('cc.lit.result')}</th>
            </tr>
          </thead>
          <tbody>
            {data && data.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="cc-table__empty">
                  {loading ? t('cc.lit.loading') : t('cc.lit.no_decisions_match')}
                </td>
              </tr>
            ) : null}
            {data?.rows.map((row, index) => (
              <tr key={`${row.rowId}-${index}`}>
                <td>
                  <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>
                </td>
                <td>{row.region ?? 'Not recorded'}</td>
                <td>{row.policyVersion}</td>
                <td>{yesNo(row.choices.necessary, t('cc.lit.yes'), t('cc.lit.no'))}</td>
                <td>{yesNo(row.choices.preferences, t('cc.lit.yes'), t('cc.lit.no'))}</td>
                <td>{yesNo(row.choices.analytics, t('cc.lit.yes'), t('cc.lit.no'))}</td>
                <td>{yesNo(row.choices.marketing, t('cc.lit.yes'), t('cc.lit.no'))}</td>
                <td>{OUTCOME_KEYS[row.outcome] === 'Custom' || !OUTCOME_KEYS[row.outcome] ? (OUTCOME_KEYS[row.outcome] ?? '') : t(OUTCOME_KEYS[row.outcome] as UiStringKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cc-pager">
        <span>
          {data ? `${data.total.toLocaleString()} decision${data.total === 1 ? '' : 's'}` : ''}
          {applied.category ? ` where ${CATEGORY_KEYS[applied.category] ? t(CATEGORY_KEYS[applied.category]) : applied.category} was ${applied.state === 'granted' ? 'allowed' : 'refused'}` : ''}
        </span>
        <div className="cc-pager__buttons">
          <button type="button" className="cc-button" disabled={page <= 1 || loading} onClick={() => startRequest(applied, page - 1)}>
            Previous
          </button>
          <span aria-live="polite">
            Page {page} of {pages}
          </span>
          <button type="button" className="cc-button" disabled={page >= pages || loading} onClick={() => startRequest(applied, page + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export default CookieConsentLog
