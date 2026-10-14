'use client'

import React from 'react'

/**
 * Shared pieces for the dashboard cards: one number tile, one plain table, and the honest message for
 * every state that is not "ok" (loading, not connected, not set up, error).
 */

export function Tile({ label, value, change, help }: { label: string; value: string; change?: string; help: string }) {
  return (
    <div className="gd-tile" title={help}>
      <span className="gd-tile__label">{label}</span>
      <span className="gd-tile__value">{value}</span>
      {change ? <span className="gd-tile__change">{change}</span> : null}
    </div>
  )
}

export type Column<T> = { head: string; cell: (row: T) => React.ReactNode; help?: string; align?: 'left' | 'right' }

export function DataTable<T>({ rows, columns, empty, rowKey }: { rows: T[]; columns: Column<T>[]; empty: string; rowKey: (row: T, index: number) => string }) {
  if (rows.length === 0) return <p className="gd-muted">{empty}</p>
  return (
    <div className="gd-table-wrap">
      <table className="gd-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.head} scope="col" title={c.help} className={c.align === 'right' ? 'gd-num' : undefined}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((c) => (
                <td key={c.head} className={c.align === 'right' ? 'gd-num' : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Renders the message for a widget state that has no data. Returns null for "ok" so the caller can show
 * its own content. `connectHref` is where the "Connect Google first" link goes.
 */
export function StateNotice({ result, connectHref = '/admin/google-connection' }: { result: { state: string; message?: string }; connectHref?: string }) {
  if (result.state === 'ok') return null
  if (result.state === 'not-connected') {
    return (
      <p className="gd-muted">
        Connect Google first. <a href={connectHref}>Open Google connection</a>
      </p>
    )
  }
  if (result.state === 'not-set-up') {
    return (
      <p className="gd-muted">
        {result.message} <a href={connectHref}>Open Google connection</a>
      </p>
    )
  }
  if (result.state === 'error') return <p className="gd-error" role="alert">{result.message}</p>
  return <p className="gd-muted">{result.message}</p>
}
