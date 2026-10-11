import React from 'react'

import { reservedSpace } from '../builders'
import { getAdsContext, getAdsPageState } from '../server'
import { isAdKey } from '../validate'

/**
 * A reserved, empty slot. The browser runtime fills it after marketing consent.
 * Renders nothing when Ads is off, the page has "No ads", or the unit is unknown or disabled.
 * Space is reserved from the unit's sizes so the page does not shift.
 */
export const AdSlot = async ({ unit, placement }: { unit?: string; placement?: string }): Promise<React.ReactElement | null> => {
  const ctx = await getAdsContext()
  if (!ctx.config || getAdsPageState().noAds) return null
  let key = unit
  if (!key && placement) key = ctx.placements.find((p) => p.key === placement && p.enabled)?.unit
  if (!key || !isAdKey(key) || !ctx.config.units[key]) return null
  const adUnit = ctx.units.get(key)
  if (!adUnit) return null
  const space = reservedSpace(adUnit)
  const style = { '--ad-h-m': `${space.mobile}px`, '--ad-h-t': `${space.tablet}px`, '--ad-h-d': `${space.desktop}px`, ...(space.maxWidth ? { maxWidth: `${space.maxWidth}px` } : {}) } as React.CSSProperties
  return (
    <div className="engage-ad" data-ad-unit={key} data-ad-reserve={ctx.marketingGranted ? undefined : '0'} style={style}>
      {ctx.settings.general.showLabel && <span className="engage-ad__label">{ctx.settings.general.label}</span>}
    </div>
  )
}
