'use client'

import React, { useMemo, useState, type ReactNode } from 'react'

import { ariaSortFor, nextTableSort, sortTableRows, type SortValue, type TableSort } from './sortTableRows'
import './sortable-table.css'

export type SortableColumn = {
  key: string
  label: ReactNode
  align?: 'left' | 'right'
  /** Set false for a column that has no meaningful order, such as an action button. Defaults to true. */
  sortable?: boolean
}

export type SortableRow = {
  id: string
  /** Values the table sorts by, keyed by column key. Plain strings, numbers or booleans only. */
  sortValues: Record<string, SortValue>
  /** What each cell shows, keyed by column key. Missing keys render an empty cell. */
  cells: Record<string, ReactNode>
}

type Props = {
  columns: SortableColumn[]
  rows: SortableRow[]
  /** Optional sort applied on first render. */
  defaultSort?: TableSort
  caption?: ReactNode
  tableClassName?: string
  headerClassName?: string
  cellClassName?: string
  tableStyle?: React.CSSProperties
}

/**
 * The one sortable admin table. Click a header to sort ascending, click again for descending.
 * The header button carries the label; `aria-sort` on the header carries the state. Sorting
 * happens on the rows it is given, so a paginated caller sorts the page it shows.
 */
export function SortableTable({
  columns,
  rows,
  defaultSort = null,
  caption,
  tableClassName,
  headerClassName,
  cellClassName,
  tableStyle,
}: Props) {
  const [sort, setSort] = useState<TableSort>(defaultSort)
  const sorted = useMemo(() => sortTableRows(rows, sort), [rows, sort])

  return (
    <table className={tableClassName ? `sortable-table ${tableClassName}` : 'sortable-table'} style={tableStyle}>
      {caption ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => {
            const sortable = column.sortable !== false
            const state = ariaSortFor(sort, column.key)
            const indicator = state === 'ascending' ? '▲' : state === 'descending' ? '▼' : '↕'
            return (
              <th
                key={column.key}
                scope="col"
                align={column.align ?? 'left'}
                className={headerClassName}
                aria-sort={sortable ? state : undefined}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="sortable-table__button"
                    onClick={() => setSort(nextTableSort(sort, column.key))}
                  >
                    {column.label}
                    <span aria-hidden="true" className="sortable-table__indicator">
                      {indicator}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column.key} align={column.align ?? 'left'} className={cellClassName}>
                {row.cells[column.key] ?? null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
