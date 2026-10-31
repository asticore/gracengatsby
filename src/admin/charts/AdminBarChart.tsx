import React from 'react'

import './admin-chart.css'

/**
 * The one bar chart for admin screens. Draws a value axis (0, half and the top value, with grid
 * lines), one bar per datum with a native tooltip, and at most about eight x labels. Plain SVG,
 * server- or client-rendered. Callers pass already-formatted text, so no formatter crosses the
 * server/client boundary.
 */

export type AdminBarDatum = {
  /** Stable key for React and for the bar. */
  key: string
  /** The bar height, in the same unit as `axisTop`. Zero or negative draws no bar. */
  value: number
  /** Short x label, shown on every nth bar so the labels stay readable. */
  label: string
  /** Native tooltip text for the bar. */
  tip: string
}

export type AdminBarChartProps = {
  data: AdminBarDatum[]
  /** Accessible name of the chart, read by screen readers. */
  ariaLabel: string
  /** Formats one value-axis tick. */
  formatTick: (value: number) => string
  /** Text shown when there are no data points at all. */
  emptyText: string
  /** Text shown when every value is zero. The chart still draws its axis. */
  allZeroText?: string
}

/** Value-axis ticks (0, half, top) for a chart whose largest bar is `max`. */
export function axisTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max))
  return [0, Math.round(top / 2), top]
}

export function AdminBarChart({ data, ariaLabel, formatTick, emptyText, allZeroText }: AdminBarChartProps) {
  if (data.length === 0) return <p className="admin-chart__empty">{emptyText}</p>

  const width = 640
  const height = 200
  const top = 12
  const bottom = 26
  const left = 64
  const right = 8
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = axisTicks(max)
  const scale = Math.max(1, ticks[ticks.length - 1])
  const slot = plotWidth / data.length
  const barWidth = Math.max(2, slot * 0.7)
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))
  const allZero = data.every((d) => d.value <= 0)

  return (
    <div className="admin-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" className="admin-chart__svg">
        {ticks.map((tick) => {
          const y = height - bottom - (plotHeight * tick) / scale
          return (
            <g key={`tick-${tick}`}>
              <line className="admin-chart__grid" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="admin-chart__axis" x={left - 6} y={y + 3} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = Math.max(0, Math.round((plotHeight * d.value) / scale))
          const x = left + i * slot + (slot - barWidth) / 2
          return (
            <g key={d.key}>
              <rect className="admin-chart__bar" x={x} y={height - bottom - h} width={barWidth} height={h}>
                <title>{d.tip}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text className="admin-chart__axis" x={x + barWidth / 2} y={height - 6} textAnchor="middle">
                  {d.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {allZero && allZeroText ? <p className="admin-chart__empty">{allZeroText}</p> : null}
    </div>
  )
}
