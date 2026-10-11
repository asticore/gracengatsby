import React from 'react'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'

import { adsCspAdditions, buildAdsTxtLines, reservedSpace } from '../builders'
import { AdPlaceholder } from '../components/AdPlaceholder'
import { getAdsContext } from '../server'
import { readDaily, readReport } from '../stats'
import { parseRange } from '../track'

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--theme-elevation-150)' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--theme-elevation-100)' }

const guard = async () => {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  return context
}

/** Status, labelled placeholders at each unit's sizes, and the lines that will be added to ads.txt. */
export async function AdsOverviewView() {
  const context = await guard()
  if (!(context.isAdmin || context.can('ad-units', 'read'))) return <p>You do not have access to Ads.</p>
  // Read through the visitor context, which is also what the live site uses.
  const ctx = await getAdsContext()
  const s = ctx.settings
  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1>Ads overview</h1>
      {!s.enabled && <p>Ads is off. Turn it on under Site Settings &gt; Features. Nothing renders or loads while it is off.</p>}
      <p>Ads load only after a visitor grants marketing cookies. A certified CMP is needed for IAB TCF; without one only non-personalised ads are requested for GDPR visitors.</p>
      <h2>Ad units (preview, no real ads)</h2>
      {[...ctx.units.values()].map((u) => {
        const r = reservedSpace(u)
        return (
          <div key={u.key} style={{ marginBottom: 16 }}>
            <strong>{u.name}</strong> <code>{u.key}</code> {u.enabled ? '' : '(disabled)'}
            <AdPlaceholder label={`${u.name} (${u.network})`} detail={`Reserved: ${r.mobile}px mobile, ${r.tablet}px tablet, ${r.desktop}px desktop`} height={r.desktop} width={r.maxWidth || undefined} />
          </div>
        )
      })}
      {ctx.units.size === 0 && <p>No ad units yet.</p>}
      <h2>ads.txt lines added automatically</h2>
      <pre>{buildAdsTxtLines(s).join('\n') || 'None. Enable a network and enter its publisher or account id.'}</pre>
      <h2>Content-Security-Policy hosts added</h2>
      <pre>{JSON.stringify(adsCspAdditions(s), null, 2)}</pre>
    </div>
  )
}

/** Own viewable-impression counts by unit for a date range. Honest about what is and is not measured. */
export async function AdsReportView({ searchParams }: { searchParams?: Record<string, string | string[]> } = {}) {
  const context = await guard()
  if (!(context.isAdmin || context.can('ad-reports', 'read'))) return <p>You do not have access to the Ads report.</p>
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const { from, to } = parseRange(one(searchParams?.from), one(searchParams?.to))
  const [rows, daily] = await Promise.all([readReport(from, to), readDaily(from, to)])
  const total = rows.reduce((n, r) => n + r.impressions, 0)
  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1>Ads report</h1>
      <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 16 }}>
        <label>From <input type="date" name="from" defaultValue={from} /></label>
        <label>To <input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">Show</button>
      </form>
      <p>
        These are our own counts of viewable impressions (at least half the slot in view for one second), measured in the browser after marketing consent. They are not the networks&apos; billing numbers and will be lower than theirs (ad blockers, declined consent).
        Clicks and revenue are not shown: clicks inside AdSense and Ad Manager ads are not visible to this site, so click-through rate appears only for units where clicks were actually recorded. Revenue is in your network dashboards.
      </p>
      <p><strong>{total.toLocaleString()}</strong> viewable impressions, {from} to {to}</p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={th}>Unit</th><th style={th}>Viewable impressions</th><th style={th}>Clicks</th><th style={th}>CTR</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.unit}><td style={td}>{r.unit}</td><td style={td}>{r.impressions.toLocaleString()}</td><td style={td}>{r.clicks ? r.clicks.toLocaleString() : 'not tracked'}</td><td style={td}>{r.ctr === null ? 'n/a' : `${(r.ctr * 100).toFixed(2)}%`}</td></tr>
          ))}
          {rows.length === 0 && <tr><td style={td} colSpan={4}>No data in this range.</td></tr>}
        </tbody>
      </table>
      {daily.length > 0 && (
        <>
          <h2>By day</h2>
          <table style={{ borderCollapse: 'collapse' }}><tbody>{daily.map((d) => <tr key={d.day}><td style={td}>{d.day}</td><td style={td}>{d.impressions.toLocaleString()}</td></tr>)}</tbody></table>
        </>
      )}
    </div>
  )
}
