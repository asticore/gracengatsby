'use client'

import React from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { formatInt, formatMoney } from '../format'
import { useWidget } from '../useWidget'
import type { AdSenseData, WidgetState } from '../types'
import { Tile, StateNotice } from './common'

/** AdSense earnings for the last 28 days, from the chosen account. Read-only. */
export function AdSenseCard() {
  const load = useWidget<AdSenseData>('adsense')
  return (
    <CollapsibleCard id="google-adsense" title="AdSense earnings (last 28 days)" className="gd-card">
      {load.phase === 'loading' ? <p className="gd-muted">Loading...</p> : <AdSenseBody result={load.result} />}
    </CollapsibleCard>
  )
}

function AdSenseBody({ result }: { result: WidgetState<AdSenseData> }) {
  if (result.state !== 'ok') return <StateNotice result={result} />
  const data = result.data
  return (
    <>
      <p className="gd-muted">Estimated earnings are AdSense&apos;s own figures and can change until payment is made.</p>
      <div className="gd-tiles">
        <Tile label="Estimated earnings" value={formatMoney(data.earnings, data.currency)} help="Money estimated from ads in the last 28 days, in your AdSense currency." />
        <Tile label="Page views" value={formatInt(data.pageViews)} help="Pages with ads that were viewed in the last 28 days." />
        <Tile label="Ad clicks" value={formatInt(data.clicks)} help="Clicks on ads in the last 28 days." />
      </div>
    </>
  )
}
