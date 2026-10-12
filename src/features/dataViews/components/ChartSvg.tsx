import React from 'react'

import { legendItems, paletteVar, type CartesianModel, type ChartModel, type PieModel, type ScatterModel } from '../chart'

/**
 * Draws a ChartModel as inline SVG. Everything numeric comes from the model; every piece of text is a
 * React child (never an attribute built from content), so it is escaped. Each mark carries a native
 * <title> tooltip and a data-tip attribute that the optional script (../enhance.ts) upgrades.
 */

const Axes = ({ plot, yTicks, xTitle, yTitle, height }: { plot: CartesianModel['plot']; yTicks: CartesianModel['yTicks']; xTitle: string; yTitle: string; height: number }) => (
  <g className="dv-axes">
    {yTicks.map((tick) => (
      <g key={tick.value}>
        <line className="dv-grid" x1={plot.left} x2={plot.left + plot.width} y1={tick.pos} y2={tick.pos} />
        <text className="dv-tick" x={plot.left - 8} y={tick.pos} textAnchor="end" dominantBaseline="middle">
          {tick.label}
        </text>
      </g>
    ))}
    {xTitle ? (
      <text className="dv-axis-title" x={plot.left + plot.width / 2} y={height - 6} textAnchor="middle">
        {xTitle}
      </text>
    ) : null}
    {yTitle ? (
      <text className="dv-axis-title" transform={`translate(12 ${plot.top + plot.height / 2}) rotate(-90)`} textAnchor="middle">
        {yTitle}
      </text>
    ) : null}
  </g>
)

function Cartesian({ model }: { model: CartesianModel }) {
  const { plot } = model
  return (
    <>
      <Axes plot={plot} yTicks={model.yTicks} xTitle={model.xTitle} yTitle={model.yTitle} height={model.height} />
      <line className="dv-baseline" x1={plot.left} x2={plot.left + plot.width} y1={model.baselineY} y2={model.baselineY} />
      {model.xLabels.map((l) => (
        <text key={l.index} className="dv-tick" x={l.x} y={plot.top + plot.height + 16} textAnchor="middle">
          {l.label}
        </text>
      ))}
      {model.bars.map((bar, i) => (
        <g key={i}>
          <rect className="dv-mark" x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={paletteVar(bar.color)} data-tip={bar.tip}>
            <title>{bar.tip}</title>
          </rect>
          {bar.label ? (
            <text className="dv-data-label" x={bar.x + bar.width / 2} y={bar.y - 4} textAnchor="middle">
              {bar.label}
            </text>
          ) : null}
        </g>
      ))}
      {model.lines.map((line) => (
        <g key={line.series}>
          {line.areaPath ? <path className="dv-area" d={line.areaPath} fill={paletteVar(line.color)} /> : null}
          <path className="dv-line" d={line.path} stroke={paletteVar(line.color)} fill="none" />
          {line.points.map((p, i) => (
            <g key={i}>
              <circle className="dv-mark dv-dot" cx={p.x} cy={p.y} r={3.5} fill={paletteVar(line.color)} data-tip={p.tip}>
                <title>{p.tip}</title>
              </circle>
              {p.label ? (
                <text className="dv-data-label" x={p.x} y={p.y - 8} textAnchor="middle">
                  {p.label}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      ))}
    </>
  )
}

function Pie({ model }: { model: PieModel }) {
  return (
    <>
      {model.slices.map((slice, i) => (
        <g key={i}>
          <path className="dv-mark dv-slice" d={slice.path} fill={paletteVar(slice.color)} fillRule="evenodd" data-tip={slice.tip}>
            <title>{slice.tip}</title>
          </path>
          {slice.showLabel ? (
            <text className="dv-data-label dv-data-label--on" x={slice.labelX} y={slice.labelY} textAnchor="middle" dominantBaseline="middle">
              {Math.round(slice.fraction * 100)}%
            </text>
          ) : null}
        </g>
      ))}
      {model.innerRadius > 0 ? (
        <text className="dv-donut-total" x={model.cx} y={model.cy} textAnchor="middle" dominantBaseline="middle">
          {model.totalLabel}
        </text>
      ) : null}
    </>
  )
}

function Scatter({ model }: { model: ScatterModel }) {
  const { plot } = model
  return (
    <>
      <Axes plot={plot} yTicks={model.yTicks} xTitle={model.xTitle} yTitle={model.yTitle} height={model.height} />
      {model.xTicks.map((tick) => (
        <text key={tick.value} className="dv-tick" x={tick.pos} y={plot.top + plot.height + 16} textAnchor="middle">
          {tick.label}
        </text>
      ))}
      {model.series.map((series) =>
        series.points.map((p, i) => (
          <circle key={`${series.color}-${i}`} className="dv-mark dv-dot" cx={p.x} cy={p.y} r={4} fill={paletteVar(series.color)} fillOpacity={0.8} data-tip={p.tip}>
            <title>{p.tip}</title>
          </circle>
        )),
      )}
    </>
  )
}

export function ChartSvg({ model, label, showLegend }: { model: ChartModel; label: string; showLegend: boolean }): React.ReactElement | null {
  if (model.type === 'empty') return model.message ? <p className="dv-empty-chart">{model.message}</p> : null
  const legend = showLegend ? legendItems(model) : []
  return (
    <div className="dv-chart-body">
      <svg className="dv-svg" viewBox={`0 0 ${model.width} ${model.height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet" focusable="false">
        <title>{label}</title>
        {model.type === 'cartesian' ? <Cartesian model={model} /> : model.type === 'pie' ? <Pie model={model} /> : <Scatter model={model} />}
      </svg>
      {legend.length > 0 ? (
        <ul className="dv-legend">
          {legend.map((item) => (
            <li key={`${item.color}-${item.name}`}>
              <span className="dv-swatch" style={{ background: paletteVar(item.color) }} aria-hidden="true" />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
