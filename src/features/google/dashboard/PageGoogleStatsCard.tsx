'use client'

import React, { useEffect, useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { formatInt, formatPercent, formatPosition } from './format'
import { Tile, DataTable, StateNotice, type Column } from './cards/common'
import type { PageSearchData, PageStatsResult, SearchRow } from './types'
import './google-dashboard.css'

/**
 * Search numbers for one published page, shown on its edit screen. Collapsed by default. Hidden
 * entirely when Google is not connected, so editors without the connection see nothing extra.
 */

type Props = { collectionSlug: string; id?: number }

const queryColumns: Column<SearchRow>[] = [
  { head: 'Search', cell: (r) => r.key },
  { head: 'Clicks', align: 'right', cell: (r) => formatInt(r.clicks), help: 'Clicks from Google results.' },
  { head: 'Impressions', align: 'right', cell: (r) => formatInt(r.impressions), help: 'Times a result was shown.' },
  { head: 'Position', align: 'right', cell: (r) => formatPosition(r.position), help: 'Average position in Google results. 1 is the top.' },
]

export function PageGoogleStatsCard({ collectionSlug, id }: Props) {
  const [result, setResult] = useState<PageStatsResult | null>(null)

  useEffect(() => {
    if (id === undefined) return
    let alive = true
    const query = new URLSearchParams({ collection: collectionSlug, id: String(id) })
    fetch(`/api/admin-google-page-stats?${query.toString()}`, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? (response.json() as Promise<PageStatsResult>) : null))
      .catch((): null => null)
      .then((next) => {
        if (alive) setResult(next ?? { state: 'error', message: 'Could not load Google numbers for this page.' })
      })
    return () => {
      alive = false
    }
  }, [collectionSlug, id])

  if (id === undefined || result?.state === 'not-connected') return null
  return (
    <CollapsibleCard id="google-page-stats" title="Google search stats for this page" className="gd-card">
      {result === null ? <p className="gd-muted">Loading...</p> : <PageBody result={result} />}
    </CollapsibleCard>
  )
}

function PageBody({ result }: { result: PageStatsResult }) {
  if (result.state !== 'ok') return <StateNotice result={result} />
  const data: PageSearchData = result.data
  const { totals } = data
  return (
    <>
      <p className="gd-muted">
        Last 28 days, for this exact address. If this shows zero for a page that is live, check that the address matches the one Google has indexed.
      </p>
      <div className="gd-tiles">
        <Tile label="Clicks" value={formatInt(totals.clicks)} help="Clicks from Google results in the last 28 days." />
        <Tile label="Impressions" value={formatInt(totals.impressions)} help="Times this page was shown in Google results." />
        <Tile label="Click rate" value={formatPercent(totals.ctr)} help="Clicks divided by impressions (CTR)." />
        <Tile label="Average position" value={formatPosition(totals.position)} help="Average position in Google results. 1 is the top. Lower is better." />
      </div>
      <h3 className="gd-subhead">Top searches for this page</h3>
      <DataTable rows={data.topQueries} columns={queryColumns} empty="No searches for this page in the last 28 days." rowKey={(r, i) => `${r.key}-${i}`} />
    </>
  )
}
