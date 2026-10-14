'use client'

import React from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { changeText, formatInt, formatPercent, formatPosition, pathOf } from '../format'
import { useWidget } from '../useWidget'
import type { SearchConsoleData, SearchRow, WidgetState } from '../types'
import { Tile, DataTable, StateNotice, type Column } from './common'

const queryColumns = (): Column<SearchRow>[] => [
  { head: 'Search', cell: (r) => r.key },
  { head: 'Clicks', align: 'right', cell: (r) => formatInt(r.clicks), help: 'Clicks from Google results.' },
  { head: 'Impressions', align: 'right', cell: (r) => formatInt(r.impressions), help: 'Times a result was shown.' },
  { head: 'Position', align: 'right', cell: (r) => formatPosition(r.position), help: 'Average position in Google results. 1 is the top.' },
]

const pageColumns = (): Column<SearchRow>[] => [
  { head: 'Page', cell: (r) => <span title={r.key}>{pathOf(r.key)}</span> },
  { head: 'Clicks', align: 'right', cell: (r) => formatInt(r.clicks), help: 'Clicks from Google results.' },
  { head: 'Impressions', align: 'right', cell: (r) => formatInt(r.impressions), help: 'Times a result was shown.' },
  { head: 'Position', align: 'right', cell: (r) => formatPosition(r.position), help: 'Average position in Google results. 1 is the top.' },
]

/** Site-wide Search Console numbers for the last 28 days against the 28 days before. */
export function SearchConsoleCard() {
  const load = useWidget<SearchConsoleData>('search')
  return (
    <CollapsibleCard id="google-search" title="Google Search Console (last 28 days)" className="gd-card">
      {load.phase === 'loading' ? <p className="gd-muted">Loading...</p> : <SearchBody result={load.result} />}
    </CollapsibleCard>
  )
}

function SearchBody({ result }: { result: WidgetState<SearchConsoleData> }) {
  if (result.state !== 'ok') return <StateNotice result={result} />
  const data = result.data
  const { current, previous } = data
  return (
    <>
      <p className="gd-muted">Compared with the 28 days before. Google reports data about three days late. Property: {data.site}</p>
      <div className="gd-tiles">
        <Tile label="Clicks" value={formatInt(current.clicks)} change={changeText(current.clicks, previous.clicks)} help="Clicks from Google results in the last 28 days." />
        <Tile label="Impressions" value={formatInt(current.impressions)} change={changeText(current.impressions, previous.impressions)} help="Times a page from this site was shown in Google results." />
        <Tile label="Click rate" value={formatPercent(current.ctr)} change={changeText(current.ctr, previous.ctr)} help="Clicks divided by impressions (CTR)." />
        <Tile label="Average position" value={formatPosition(current.position)} help="Average position in Google results. 1 is the top. Lower is better." />
      </div>
      <h3 className="gd-subhead">Top searches</h3>
      <DataTable rows={data.topQueries} columns={queryColumns()} empty="No searches in this period yet." rowKey={(r, i) => `${r.key}-${i}`} />
      <h3 className="gd-subhead">Top pages</h3>
      <DataTable rows={data.topPages} columns={pageColumns()} empty="No pages in this period yet." rowKey={(r, i) => `${r.key}-${i}`} />
    </>
  )
}
