import Link from 'next/link'
import React from 'react'
import type { ReviewQueueRow } from '@/features/approval/handlers'
import { formatRelativeTime } from '@/views/dashboard/dashboardData'
import { APPROVAL_SINGULAR } from '@/features/approval/settings'

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The rows of the review queue: what, who sent it, how long it has waited. Server-rendered. */
/** Without `now` the time is shown as a date; with it, as "3 hours ago". */
export const ReviewQueueTable: React.FC<{ rows: ReviewQueueRow[]; now?: number }> = ({ rows, now }) => {
  const headerClass =
    'whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]'
  const cellClass = 'border-b border-[var(--theme-elevation-100)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.6)] align-middle'

  if (rows.length === 0) {
    return (
      <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
        Nothing is waiting for review.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)]">
      <table className="w-full border-collapse text-[calc(var(--base)*0.8)]">
        <thead>
          <tr>
            <th className={headerClass} scope="col">Title</th>
            <th className={headerClass} scope="col">Type</th>
            <th className={headerClass} scope="col">Sent by</th>
            <th className={headerClass} scope="col">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.collection}-${row.id}`}>
              <td className={cellClass}>
                <Link className="font-medium text-[var(--ac-gold)] no-underline hover:underline" href={row.href}>
                  {row.title}
                </Link>
              </td>
              <td className={cellClass}>{APPROVAL_SINGULAR[row.collection]}</td>
              <td className={cellClass}>{row.requestedBy}</td>
              <td className={`${cellClass} whitespace-nowrap text-[var(--theme-elevation-600)]`}>
                {now === undefined ? formatDate(row.requestedAt) : formatRelativeTime(row.requestedAt, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
