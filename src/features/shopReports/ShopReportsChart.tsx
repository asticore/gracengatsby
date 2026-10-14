'use client'

import React from 'react'

import { formatMoney } from '@/features/ecommerce/lib/money'
import type { SeriesPoint } from './shape'

/** Revenue per bucket as plain SVG bars. Each bar has a tooltip with its period, orders and revenue. */
export function ShopReportsChart({ points, currency, bucketLabel }: { points: SeriesPoint[]; currency: string; bucketLabel: string }) {
  if (points.length === 0) return <p className="shop-reports__empty">No days in this range.</p>
  const width = 640
  const height = 200
  const top = 12
  const bottom = 26
  const max = Math.max(1, ...points.map((p) => p.revenueCents))
  const slot = width / points.length
  const barWidth = Math.max(2, slot * 0.7)
  // Show at most about eight period labels so they stay readable.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))
  const empty = points.every((p) => p.revenueCents === 0)

  return (
    <div className="shop-reports__chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Revenue per ${bucketLabel}`} preserveAspectRatio="none" className="shop-reports__svg">
        {points.map((p, i) => {
          const h = Math.round(((height - top - bottom) * p.revenueCents) / max)
          const x = i * slot + (slot - barWidth) / 2
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
