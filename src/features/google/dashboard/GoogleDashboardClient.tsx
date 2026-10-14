'use client'

import React from 'react'

import { AdSenseCard } from './cards/AdSenseCard'
import { AnalyticsCard } from './cards/AnalyticsCard'
import { SearchConsoleCard } from './cards/SearchConsoleCard'
import { SpeedCard } from './cards/SpeedCard'
import './google-dashboard.css'

/** The four cards, one under the other. Each loads on its own, so one slow source never blocks the rest. */
export function GoogleDashboardClient() {
  return (
    <div className="gd-stack">
      <SearchConsoleCard />
      <AnalyticsCard />
      <SpeedCard />
      <AdSenseCard />
    </div>
  )
}
