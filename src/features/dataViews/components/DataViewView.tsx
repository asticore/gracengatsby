import React from 'react'

import { buildChart } from '../chart'
import type { DataViewModel } from '../types'

import { ChartSvg } from './ChartSvg'
import { DataTable } from './DataTable'
import { DataViewEnhancer } from './DataViewEnhancer'

import './dataViews.css'

/**
 * One table or chart, ready to place in a page, an embed or the editor preview. Presentational: the
 * model (view settings plus resolved data) is built on the server. Charts also carry a visually hidden
 * table with the same numbers, which is what a screen reader reads.
 */
export function DataViewView({ model, enhance = true }: { model: DataViewModel; enhance?: boolean }): React.ReactElement {
  const { view, data } = model
  const chart = view.kind === 'table' ? null : buildChart(view.kind, data, view.chart)
  return (
    <div className="dv" data-dv-id={view.id} data-dv-kind={view.kind}>
      {view.kind === 'table' ? (
        <DataTable model={model} />
      ) : (
        <figure className="dv-figure" style={{ ['--dv-height' as string]: `${view.chart.height}px` }}>
          {view.display.caption ? <figcaption className="dv-caption">{view.display.caption}</figcaption> : null}
          {chart ? <ChartSvg model={chart} label={view.title} showLegend={view.chart.legend} /> : null}
          {chart && chart.type !== 'empty' ? (
            <div className="dv-sr">
              <DataTable model={{ view: { ...view, display: { ...view.display, caption: `${view.title} data`, totalsRow: false, footerRow: false } }, data: { ...data, rows: data.rows.slice(0, 200) } }} plain />
            </div>
          ) : null}
        </figure>
      )}
      {enhance ? <DataViewEnhancer /> : null}
    </div>
  )
}
