import React from 'react'

import { safeJson } from '../builders'
import { getAdsContext } from '../server'
import { AdsRuntime } from './AdsRuntime'
import './ads.css'

/** Place once in the root layout. Renders nothing at all unless Ads is on and configured. */
export const AdsRoot = async (): Promise<React.ReactElement | null> => {
  const ctx = await getAdsContext()
  if (!ctx.config) return null
  return (
    <>
      <script id="engage-ads-config" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson({ v: 1, units: Object.keys(ctx.config.units).length }) }} />
      <AdsRuntime config={ctx.config} optIn={ctx.optIn} policyVersion={ctx.policyVersion} />
    </>
  )
}
