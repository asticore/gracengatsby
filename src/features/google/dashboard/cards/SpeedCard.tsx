'use client'

import React from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { formatInt, pathOf } from '../format'
import { useWidget } from '../useWidget'
import type { SpeedSummary, WidgetState } from '../types'
import { Tile, DataTable, StateNotice, type Column } from './common'

type Row = SpeedSummary['worst'][number]

const columns: Column<Row>[] = [
  { head: 'Page', cell: (r) => <a href={r.editHref} title={r.url}>{pathOf(r.url)}</a> },
  { head: 'Mobile score', align: 'right', cell: (r) => formatInt(r.performance), help: 'PageSpeed performance score on a phone, 0 to 100. 90 or more is good.' },
]

/** The PageSpeed results the site already stores: average mobile score and the lowest pages. */
export function SpeedCard() {
  const load = useWidget<SpeedSummary>('speed')
  return (
    <CollapsibleCard id="google-speed" title="PageSpeed (from stored tests)" className="gd-card">
      {load.phase === 'loading' ? <p className="gd-muted">Loading...</p> : <SpeedBody result={load.result} />}
    </CollapsibleCard>
  )
}

function SpeedBody({ result }: { result: WidgetState<SpeedSummary> }) {
  if (result.state !== 'ok') return <StateNotice result={result} />
  const data = result.data
  if (data.tested === 0) {
    return <p className="gd-muted">No PageSpeed tests yet. Run a test from the PageSpeed card on any published page.</p>
  }
  return (
    <>
      <div className="gd-tiles">
        <Tile label="Pages tested" value={formatInt(data.tested)} help="Published pages with a stored mobile test." />
        <Tile label="Average mobile score" value={data.averagePerformance === null ? '-' : formatInt(data.averagePerformance)} help="Average performance score on a phone, 0 to 100. 90 or more is good." />
      </div>
      <h3 className="gd-subhead">Lowest scores first</h3>
      <DataTable rows={data.worst} columns={columns} empty="No tests to show." rowKey={(r) => `${r.collection}-${r.docId}`} />
    </>
  )
}
