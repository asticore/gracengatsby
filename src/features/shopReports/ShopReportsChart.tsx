'use client'

import React from 'react'

import { formatMoney } from '@/features/ecommerce/lib/money'
import { AdminBarChart, axisTicks, type AdminBarDatum } from '@/admin/charts/AdminBarChart'
import type { SeriesPoint } from './shape'

/** Value-axis ticks (0, half, top) for a revenue chart whose largest bar is `max` cents. */
export function revenueAxisTicks(max: number): number[] {
  return axisTicks(max)
}

/**
 * Revenue per bucket on the shared admin bar chart (src/admin/charts). The value axis shows 0,
 * half and the top amount; each bar has a tooltip with its period, orders and revenue.
 */
export function ShopReportsChart({ points, currency, bucketLabel }: { points: SeriesPoint[]; currency: string; bucketLabel: string }) {
  const data: AdminBarDatum[] = points.map((p) => ({
    key: p.bucket,
    value: p.revenueCents,
    label: p.bucket.slice(5),
    tip: `${p.bucket} (${bucketLabel}): ${p.orders} orders, ${formatMoney(p.revenueCents, currency)}`,
  }))
  return (
    <div className="shop-reports__chart">
      <AdminBarChart
        data={data}
        ariaLabel={`Revenue per ${bucketLabel}`}
        formatTick={(tick) => formatMoney(tick, currency)}
        emptyText="No days in this range."
        allZeroText="No paid orders in this range yet."
      />
    </div>
  )
}
