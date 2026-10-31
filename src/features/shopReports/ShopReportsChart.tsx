'use client'

import React from 'react'

import { formatMoney } from '@/features/ecommerce/lib/money'
import type { SeriesPoint } from './shape'

/** Value-axis ticks (0, half, top) for a revenue chart whose largest bar is `max` cents. */
export function revenueAxisTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max))
  return [0, Math.round(top / 2), top]
}

/**
 * Revenue per bucket as plain SVG bars. The value axis on the left shows 0, half
 * and the top amount; each bar has a tooltip with its period, orders and revenue.
 */
export function ShopReportsChart({ points, currency, bucketLabel }: { points: SeriesPoint[]; currency: string; bucketLabel: string }) {
  if (points.length === 0) return <p className="shop-reports__empty">No days in this range.</p>
  const width = 640
  const height = 200
  const top = 12
  const bottom = 26
  const left = 64
  const right = 8
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const max = Math.max(1, ...points.map((p) => p.revenueCents))
  const ticks = revenueAxisTicks(max)
  const scale = Math.max(1, ticks[ticks.length - 1])
  const slot = plotWidth / points.length
  const barWidth = Math.max(2, slot * 0.7)
  // Show at most about eight period labels so they stay readable.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))
  const empty = points.every((p) => p.revenueCents === 0)

  return (
    <div className="shop-reports__chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Revenue per ${bucketLabel}`} preserveAspectRatio="none" className="shop-reports__svg">
        {ticks.map((tick) => {
          const y = height - bottom - (plotHeight * tick) / scale
          return (
            <g key={`tick-${tick}`}>
              <line className="shop-reports__grid" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="shop-reports__axis" x={left - 6} y={y + 3} textAnchor="end">
                {formatMoney(tick, currency)}
              </text>
            </g>
          )
        })}
        {points.map((p, i) => {
          const h = Math.round((plotHeight * p.revenueCents) / scale)
          const x = left + i * slot + (slot - barWidth) / 2
          return (
            <g key={p.bucket}>
              <rect className="shop-reports__bar" x={x} y={height - bottom - h} width={barWidth} height={Math.max(h, 0)}>
                <title>{`${p.bucket} (${bucketLabel}): ${p.orders} orders, ${formatMoney(p.revenueCents, currency)}`}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text className="shop-reports__axis" x={x + barWidth / 2} y={height - 6} textAnchor="middle">
                  {p.bucket.slice(5)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {empty ? <p className="shop-reports__empty">No paid orders in this range yet.</p> : null}
    </div>
  )
}
