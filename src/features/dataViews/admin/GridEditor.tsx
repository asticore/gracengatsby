'use client'

import React from 'react'

import { parseCsv } from '@/lib/spreadsheet/csv'

import { LIMITS, type GridConfig } from '../types'

/**
 * A small spreadsheet: type in cells, add or remove rows and columns, choose whether the first row
 * holds headings. Pasting several cells from Excel or Google Sheets (tab separated) fills the grid
 * from the cell you pasted into. Merged cells are not supported.
 */
export function GridEditor({ grid, onChange, readOnly }: { grid: GridConfig; onChange: (next: GridConfig) => void; readOnly?: boolean }) {
  const rows = grid.rows
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0) || 1

  const set = (next: string[][]): void => onChange({ ...grid, rows: next })
  const setCell = (r: number, c: number, value: string): void => set(rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value.slice(0, LIMITS.maxCell) : cell)) : row)))
  const addRow = (): void => {
    if (rows.length < LIMITS.maxGridRows) set([...rows, Array.from({ length: width }, () => '')])
  }
  const addCol = (): void => {
    if (width < LIMITS.maxGridCols) set(rows.map((row) => [...row, '']))
  }
  const removeRow = (r: number): void => set(rows.length > 1 ? rows.filter((_, ri) => ri !== r) : rows)
  const removeCol = (c: number): void => set(width > 1 ? rows.map((row) => row.filter((_, ci) => ci !== c)) : rows)

  const paste = (event: React.ClipboardEvent<HTMLInputElement>, r: number, c: number): void => {
    const text = event.clipboardData.getData('text')
    if (!/[\t\n]/.test(text)) return
    event.preventDefault()
    const pasted = parseCsv(text, { delimiter: '\t', maxRows: LIMITS.maxGridRows }).rows
    const next = rows.map((row) => row.slice())
    pasted.forEach((line, pr) => {
      const ri = r + pr
      if (ri >= LIMITS.maxGridRows) return
      while (next.length <= ri) next.push(Array.from({ length: width }, () => ''))
      line.forEach((value, pc) => {
        const ci = c + pc
        if (ci >= LIMITS.maxGridCols) return
        for (const row of next) while (row.length <= ci) row.push('')
        next[ri]![ci] = value.slice(0, LIMITS.maxCell)
      })
    })
    set(next)
  }

  return (
    <div className="dve-grid">
      <label className="dve-check">
        <input type="checkbox" checked={grid.headerRow} disabled={readOnly} onChange={(e) => onChange({ ...grid, headerRow: e.target.checked })} /> The first row holds the column headings
      </label>
      <div className="dve-grid__scroll">
        <table className="dve-grid__table">
          <thead>
            <tr>
              <th aria-label="Row" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c}>
                  <button type="button" className="dve-link" disabled={readOnly || width <= 1} onClick={() => removeCol(c)} title="Remove this column">
                    Remove column {c + 1}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 && grid.headerRow ? 'dve-grid__head' : undefined}>
                <th scope="row">
                  <button type="button" className="dve-link" disabled={readOnly || rows.length <= 1} onClick={() => removeRow(r)} title="Remove this row">
                    Remove
                  </button>
                </th>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c}>
                    <input
                      type="text"
                      value={row[c] ?? ''}
                      readOnly={readOnly}
                      aria-label={`Row ${r + 1}, column ${c + 1}`}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onPaste={(e) => paste(e, r, c)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dve-row">
        <button type="button" className="dve-btn" disabled={readOnly || rows.length >= LIMITS.maxGridRows} onClick={addRow}>
          Add row
        </button>
        <button type="button" className="dve-btn" disabled={readOnly || width >= LIMITS.maxGridCols} onClick={addCol}>
          Add column
        </button>
        <span className="dve-help">
          Up to {LIMITS.maxGridRows} rows and {LIMITS.maxGridCols} columns. Paste from a spreadsheet into any cell to fill several at once.
        </span>
      </div>
    </div>
  )
}
