'use client'

import React from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

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
  const t = useAdminT()
  const data: AdminBarDatum[] = points.map((p) => ({
    key: p.bucket,
    value: p.revenueCents,
    label: p.bucket.slice(5),
    tip: t('chart.orderTip', { bucket: p.bucket, period: bucketLabel, orders: p.orders, revenue: formatMoney(p.revenueCents, currency) }),
  }))
  return (
    <div className="shop-reports__chart">
      <AdminBarChart
        data={data}
        ariaLabel={t('chart.revenuePer', { period: bucketLabel })}
        formatTick={(tick) => formatMoney(tick, currency)}
        emptyText={t('chart.noDays')}
        allZeroText={t('chart.noPaidOrders')}
      />
    </div>
  )
}
