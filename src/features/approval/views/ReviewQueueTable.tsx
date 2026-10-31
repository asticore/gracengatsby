import Link from 'next/link'
import React from 'react'
import type { ReviewQueueRow } from '@/features/approval/handlers'
import { formatRelativeTime } from '@/views/dashboard/dashboardData'
import { APPROVAL_SINGULAR } from '@/features/approval/settings'
import { UI_STRING_SOURCE, type UiStringKey } from '@/features/uiStrings/keys'
import { SortableTable, type SortableColumn, type SortableRow } from '@/admin/table/SortableTable'

/** English unless the caller passes its translator (server views use getAdminUi().t). */
const englishT = (key: UiStringKey): string => UI_STRING_SOURCE[key]

function formatDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The rows of the review queue: what, who sent it, how long it has waited. Server-rendered. */
/** Without `now` the time is shown as a date; with it, as "3 hours ago". */
export const ReviewQueueTable: React.FC<{ rows: ReviewQueueRow[]; now?: number; t?: (key: UiStringKey) => string }> = ({ rows, now, t = englishT }) => {
  const headerClass =
    'whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]'
  const cellClass = 'border-b border-[var(--theme-elevation-100)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.6)] align-middle'

  if (rows.length === 0) {
    return (
      <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
        {t('approval.nothingWaiting')}
      </p>
    )
  }

  const columns: SortableColumn[] = [
    { key: 'title', label: t('approval.col.title') },
    { key: 'type', label: t('approval.col.type') },
    { key: 'sentBy', label: t('approval.col.sentBy') },
    { key: 'waiting', label: t('approval.col.waiting') },
  ]
  const tableRows: SortableRow[] = rows.map((row) => ({
    id: `${row.collection}-${row.id}`,
    sortValues: {
      title: row.title,
      type: APPROVAL_SINGULAR[row.collection],
      sentBy: row.requestedBy,
      waiting: row.requestedAt ? new Date(row.requestedAt).getTime() : null,
    },
    cells: {
      title: (
        <Link className="font-medium text-[var(--ac-gold)] no-underline hover:underline" href={row.href}>
          {row.title}
        </Link>
      ),
      type: APPROVAL_SINGULAR[row.collection],
      sentBy: row.requestedBy,
      waiting: now === undefined ? formatDate(row.requestedAt) : formatRelativeTime(row.requestedAt, now),
    },
  }))

  return (
    <div className="overflow-x-auto rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)]">
      <SortableTable
        columns={columns}
        rows={tableRows}
        tableClassName="w-full border-collapse text-[calc(var(--base)*0.8)]"
        headerClassName={headerClass}
        cellClassName={cellClass}
      />
    </div>
  )
}
