// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ShopReportsChart, revenueAxisTicks } from '@/features/shopReports/ShopReportsChart'
import type { SeriesPoint } from '@/features/shopReports/shape'

const point = (bucket: string, revenueCents: number): SeriesPoint =>
  ({ bucket, orders: revenueCents > 0 ? 1 : 0, revenueCents }) as SeriesPoint

describe('shop revenue chart value axis', () => {
  it('draws 0, half and the top amount', () => {
    expect(revenueAxisTicks(10000)).toEqual([0, 5000, 10000])
    expect(revenueAxisTicks(12345)).toEqual([0, 6173, 12345])
    expect(revenueAxisTicks(0)).toEqual([0, 1, 1])
  })

  it('labels the value axis with money and keeps the bar tooltips', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShopReportsChart, {
        points: [point('2026-10-01', 2000), point('2026-10-02', 4000)],
        currency: 'AUD',
        bucketLabel: 'day',
      }),
    )
    expect(html).toContain('admin-chart__grid')
    expect(html).toContain('$40.00')
    expect(html).toContain('$20.00')
    expect(html).toContain('2026-10-02 (day): 1 orders, $40.00')
  })

  it('shows the empty message when no paid orders exist', () => {
    const html = renderToStaticMarkup(
      React.createElement(ShopReportsChart, { points: [point('2026-10-01', 0)], currency: 'AUD', bucketLabel: 'day' }),
    )
    expect(html).toContain('No paid orders in this range yet.')
  })
})
