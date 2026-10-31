// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AdminBarChart, axisTicks } from '@/admin/charts/AdminBarChart'

describe('shared admin bar chart', () => {
  it('ticks are 0, half and the top value', () => {
    expect(axisTicks(100)).toEqual([0, 50, 100])
    expect(axisTicks(0)).toEqual([0, 1, 1])
  })

  it('labels the axis, names the chart and gives each bar a tooltip', () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminBarChart, {
        data: [
          { key: 'a', value: 10, label: '10-01', tip: 'first tip' },
          { key: 'b', value: 20, label: '10-02', tip: 'second tip' },
        ],
        ariaLabel: 'Sales per day',
        formatTick: (v: number) => `${v} units`,
        emptyText: 'Nothing yet',
      }),
    )
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Sales per day"')
    expect(html).toContain('admin-chart__grid')
    expect(html).toContain('20 units')
    expect(html).toContain('<title>first tip</title>')
    expect(html).toContain('>10-02<')
  })

  it('shows the empty text when there are no data points', () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminBarChart, { data: [], ariaLabel: 'x', formatTick: String, emptyText: 'Nothing yet' }),
    )
    expect(html).toContain('Nothing yet')
    expect(html).not.toContain('<svg')
  })

  it('shows the all-zero text while still drawing the axis', () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminBarChart, {
        data: [{ key: 'a', value: 0, label: 'd', tip: 't' }],
        ariaLabel: 'x',
        formatTick: String,
        emptyText: 'Nothing yet',
        allZeroText: 'All zero',
      }),
    )
    expect(html).toContain('<svg')
    expect(html).toContain('All zero')
  })
})
