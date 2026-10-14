'use client'

import React, { useEffect, useState } from 'react'

import { formatMoney } from '@/features/ecommerce/lib/money'
import type { ShopReport } from './report'
import { ShopReportsChart } from './ShopReportsChart'
import { ShopReportTables } from './ShopReportTables'
import './shop-reports.css'

type Query = { preset: string; from: string; to: string; bucket: string; products: number; locations: number; lowStock: number }
type Payload = { currency: string; report: ShopReport }

const PRESETS: { value: string; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom dates' },
]
const BUCKET_LABEL: Record<string, string> = { day: 'day', week: 'week', month: 'month' }

const INITIAL: Query = { preset: '30d', from: '', to: '', bucket: '', products: 1, locations: 1, lowStock: 1 }

/** The query string the screen and the CSV links share. */
function toParams(q: Query): string {
  const p = new URLSearchParams({ preset: q.preset, products: String(q.products), locations: String(q.locations), lowStock: String(q.lowStock) })
  if (q.preset === 'custom') {
    if (q.from) p.set('from', q.from)
    if (q.to) p.set('to', q.to)
  }
  if (q.bucket) p.set('bucket', q.bucket)
  return p.toString()
}

/**
 * The Shop reports screen: a date range, headline numbers, a revenue chart and the detail tables.
 * Every number comes from /api/admin-shop-reports (SQL on the server, cached five minutes).
 */
export function ShopReportsPanel() {
  const [query, setQuery] = useState<Query>(INITIAL)
  const [result, setResult] = useState<{ key: string; data?: Payload; error?: string }>({ key: '' })
  const key = toParams(query)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin-shop-reports?${key}`, { credentials: 'include' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Payload & { error?: string }
        if (cancelled) return
        if (!res.ok) setResult({ key, error: body.error || 'The report could not be loaded.' })
        else setResult({ key, data: body })
      })
      .catch(() => {
        if (!cancelled) setResult({ key, error: 'The report could not be loaded. Check the connection and try again.' })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  const busy = result.key !== key
  const data = result.data
  const set = (patch: Partial<Query>) => setQuery((q) => ({ ...q, ...patch }))
  const money = (cents: number) => formatMoney(cents, data?.currency ?? 'AUD')

  return (
    <div className="shop-reports">
      <div className="shop-reports__controls">
        <label className="shop-reports__field">
          <span>Date range</span>
          <select value={query.preset} onChange={(e) => set({ preset: e.target.value, products: 1, locations: 1, lowStock: 1 })}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {query.preset === 'custom' ? (
          <>
            <label className="shop-reports__field">
              <span>From</span>
              <input type="date" value={query.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="shop-reports__field">
              <span>To</span>
              <input type="date" value={query.to} onChange={(e) => set({ to: e.target.value })} />
            </label>
          </>
        ) : null}
        <label className="shop-reports__field" title="How the chart groups sales. Leave on automatic to let the range decide.">
          <span>Chart groups by</span>
          <select value={query.bucket} onChange={(e) => set({ bucket: e.target.value })}>
            <option value="">Automatic</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>

      {data ? (
        <p className="shop-reports__range">
          Showing {data.report.range.from} to {data.report.range.to} ({data.report.range.days} days, UTC dates). Refunds are counted on the day they were made.
        </p>
      ) : null}
      {busy && !result.error ? <p className="shop-reports__range">Loading the report...</p> : null}
      {result.error && !busy ? <p className="shop-reports__error">{result.error}</p> : null}

      {data && !busy ? (
        <>
          <div className="shop-reports__kpis">
            <Kpi label="Revenue" value={money(data.report.kpis.revenueCents)} hint="Order totals, including shipping and tax, before refunds." />
            <Kpi label="Net revenue" value={money(data.report.kpis.netRevenueCents)} hint="Revenue less refunds made in this range." />
            <Kpi label="Orders" value={String(data.report.kpis.orders)} hint="Paid orders (processing, on hold, completed or refunded)." />
            <Kpi label="Average order" value={money(data.report.kpis.averageOrderCents)} hint="Revenue divided by orders." />
            <Kpi label="Refunds" value={money(data.report.kpis.refundsCents)} hint={`${data.report.kpis.refundCount} refund(s) made in this range.`} />
            <Kpi label="Units sold" value={String(data.report.kpis.unitsSold)} hint="Items sold, not counting gift cards." />
            <Kpi
              label="Customers"
              value={String(data.report.kpis.customers)}
              hint="Different email addresses that ordered. New means their first paid order was in this range."
              extra={`${data.report.kpis.newCustomers} new, ${data.report.kpis.returningCustomers} returning`}
            />
          </div>
          <section className="shop-reports__chart-card">
            <h3>Revenue per {BUCKET_LABEL[data.report.range.bucket]}</h3>
            <ShopReportsChart points={data.report.series} currency={data.currency} bucketLabel={BUCKET_LABEL[data.report.range.bucket]} />
          </section>
          <ShopReportTables
            report={data.report}
            currency={data.currency}
            csvQuery={key}
            onPage={(table, page) => set({ [table]: page } as Partial<Query>)}
          />
        </>
      ) : null}
    </div>
  )
}

function Kpi({ label, value, hint, extra }: { label: string; value: string; hint: string; extra?: string }) {
  return (
    <div className="shop-reports__kpi" title={hint}>
      <span className="shop-reports__kpi-label">{label}</span>
      <strong className="shop-reports__kpi-value">{value}</strong>
      {extra ? <span className="shop-reports__kpi-extra">{extra}</span> : null}
    </div>
  )
}
