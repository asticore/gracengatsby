import React from 'react'

import { formatCell, parseNumber } from '../format'
import type { Cell, DataViewModel, ResolvedColumn } from '../types'

/**
 * The accessible table: a real <table> with a caption, column headers (th scope="col") and the first
 * text column as row headers (th scope="row"). It is complete without JavaScript; the small script in
 * ../enhance.ts adds sorting, search and paging on top. Text goes through React, which escapes it.
 */

const sortValue = (cell: Cell, column: ResolvedColumn): string => {
  if (cell === null || cell === undefined || cell === '') return ''
  if (column.type === 'number') {
    const n = parseNumber(cell)
    return n === null ? '' : String(n)
  }
  if (column.type === 'date') {
    const time = typeof cell === 'string' ? Date.parse(cell) : NaN
    return Number.isNaN(time) ? '' : String(time)
  }
  return String(cell).toLowerCase()
}

/** Sums every number column. Columns with no numbers get a blank cell. */
export function totalsFor(columns: ResolvedColumn[], rows: Cell[][]): (number | null)[] {
  return columns.map((column, ci) => {
    if (column.type !== 'number') return null
    let sum = 0
    let seen = false
    for (const row of rows) {
      const n = parseNumber(row[ci] ?? null)
      if (n !== null) {
        sum += n
        seen = true
      }
    }
    return seen ? Math.round(sum * 1e6) / 1e6 : null
  })
}

export function DataTable({ model, plain = false }: { model: DataViewModel; plain?: boolean }): React.ReactElement {
  const { view, data } = model
  const { display } = view
  const { columns, rows } = data
  const rowHeaderIndex = columns.findIndex((c) => c.type === 'text')
  const rowHeader = rowHeaderIndex === 0 ? 0 : -1
  const totals = display.totalsRow ? totalsFor(columns, rows) : null
  const sortable = display.sortable && !plain

  const classes = ['dv-table', display.zebra ? 'dv-zebra' : '', display.stickyHeader ? 'dv-sticky' : '', display.responsive === 'stacked' ? 'dv-stacked' : ''].filter(Boolean).join(' ')

  return (
    <div className="dv-table-wrap" data-dv-table="" data-dv-sortable={sortable ? '1' : undefined} data-dv-search={display.searchable && !plain ? '1' : undefined} data-dv-pagesize={!plain && display.pageSize > 0 ? String(display.pageSize) : undefined}>
      <div className={display.stickyHeader ? 'dv-scroll dv-scroll--sticky' : 'dv-scroll'} tabIndex={display.responsive === 'scroll' ? 0 : undefined} role={display.responsive === 'scroll' ? 'region' : undefined} aria-label={display.responsive === 'scroll' ? `${view.title} (scrollable table)` : undefined}>
        <table className={classes}>
          {display.caption ? <caption>{display.caption}</caption> : null}
          {display.showHeader ? (
            <thead>
              <tr>
                {columns.map((column, ci) => (
                  <th key={column.key} scope="col" className={column.type === 'number' ? 'dv-num' : undefined} data-col={ci} data-type={column.type} aria-sort={sortable ? 'none' : undefined}>
                    {sortable ? (
                      <button type="button" className="dv-sort" data-sort-col={ci}>
                        {column.label}
                        <span className="dv-sort-mark" aria-hidden="true" />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="dv-empty">
                  Nothing to show yet.
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr key={ri} data-row={ri}>
                  {columns.map((column, ci) => {
                    const cell = row[ci] ?? null
                    const text = formatCell(cell, column)
                    const className = column.type === 'number' ? 'dv-num' : undefined
                    return ci === rowHeader ? (
                      <th key={ci} scope="row" className={className} data-label={column.label} data-sort={sortable ? sortValue(cell, column) : undefined}>
                        {text}
                      </th>
                    ) : (
                      <td key={ci} className={className} data-label={column.label} data-sort={sortable ? sortValue(cell, column) : undefined}>
                        {text}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
          {totals || (display.footerRow && display.showHeader) ? (
            <tfoot>
              {totals ? (
                <tr className="dv-totals">
                  {columns.map((column, ci) => {
                    const total = totals[ci] ?? null
                    if (ci === 0 && total === null) {
                      return (
                        <th key={ci} scope="row" data-label={column.label}>
                          {display.totalsLabel}
                        </th>
                      )
                    }
                    return (
                      <td key={ci} className={column.type === 'number' ? 'dv-num' : undefined} data-label={column.label}>
                        {total === null ? '' : formatCell(total, column)}
                      </td>
                    )
                  })}
                </tr>
              ) : null}
              {display.footerRow && display.showHeader ? (
                <tr className="dv-footer-heads">
                  {columns.map((column, ci) => (
                    <th key={ci} scope="col" className={column.type === 'number' ? 'dv-num' : undefined}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              ) : null}
            </tfoot>
          ) : null}
        </table>
      </div>
      {data.truncated ? <p className="dv-note">Showing the first {rows.length} rows.</p> : null}
    </div>
  )
}
