'use client'

import React from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { changeText, formatInt, pathOf } from '../format'
import { useWidget } from '../useWidget'
import type { AnalyticsData, WidgetState } from '../types'
import { Tile, DataTable, StateNotice, type Column } from './common'

const pageColumns: Column<AnalyticsData['topPages'][number]>[] = [
  { head: 'Page', cell: (r) => <span title={r.path}>{pathOf(r.path)}</span> },
  { head: 'Views', align: 'right', cell: (r) => formatInt(r.views), help: 'Times the page was viewed.' },
  { head: 'Visitors', align: 'right', cell: (r) => formatInt(r.users), help: 'Different people who viewed the page.' },
]

const sourceColumns: Column<AnalyticsData['sources'][number]>[] = [
  { head: 'Where visitors came from', cell: (r) => r.channel },
  { head: 'Visits', align: 'right', cell: (r) => formatInt(r.sessions), help: 'A visit is one session on the site.' },
  { head: 'Visitors', align: 'right', cell: (r) => formatInt(r.users), help: 'Different people in that group.' },
]

/** GA4 users and sessions for the last 28 days, with the top pages and traffic sources. */
export function AnalyticsCard() {
  const load = useWidget<AnalyticsData>('analytics')
  return (
    <CollapsibleCard id="google-analytics" title="Google Analytics (last 28 days)" className="gd-card">
      {load.phase === 'loading' ? <p className="gd-muted">Loading...</p> : <AnalyticsBody result={load.result} />}
    </CollapsibleCard>
  )
}

function AnalyticsBody({ result }: { result: WidgetState<AnalyticsData> }) {
  if (result.state !== 'ok') return <StateNotice result={result} />
  const data = result.data
  return (
    <>
      <p className="gd-muted">Compared with the 28 days before.</p>
      <div className="gd-tiles">
        <Tile label="Visitors" value={formatInt(data.current.users)} change={changeText(data.current.users, data.previous.users)} help="Different people who visited in the last 28 days." />
        <Tile label="Visits" value={formatInt(data.current.sessions)} change={changeText(data.current.sessions, data.previous.sessions)} help="A visit is one session on the site." />
      </div>
      <h3 className="gd-subhead">Top pages</h3>
      <DataTable rows={data.topPages} columns={pageColumns} empty="No page views in this period yet." rowKey={(r, i) => `${r.path}-${i}`} />
      <h3 className="gd-subhead">Where visitors came from</h3>
      <DataTable rows={data.sources} columns={sourceColumns} empty="No visits in this period yet." rowKey={(r, i) => `${r.channel}-${i}`} />
    </>
  )
}
