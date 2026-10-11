import React from 'react'

import type { PlacementMode } from '../validate'
import { getAdsContext } from '../server'
import { AdSlot } from './AdSlot'

/** Every enabled placement for a fixed position: header, footer or sidebar. */
export const AdPlacements = async ({ position }: { position: Extract<PlacementMode, 'header' | 'footer' | 'sidebar'> }): Promise<React.ReactElement | null> => {
  const ctx = await getAdsContext()
  if (!ctx.config) return null
  const list = ctx.placements.filter((p) => p.enabled && p.mode === position)
  if (!list.length) return null
  return <>{list.map((p) => <AdSlot key={p.key} placement={p.key} />)}</>
}
