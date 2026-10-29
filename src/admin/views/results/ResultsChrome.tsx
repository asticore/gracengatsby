'use client'

import React from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { PageInfo } from './rows'

/** One figure above a results table. */
export function ResultsStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="et-stat">
      <span className="et-stat__value">{value}</span>
      <span className="et-stat__label">{label}</span>
    </div>
  )
}

/** Previous and next buttons with a "Page x of y" line. Hidden when everything fits on one page. */
export function ResultsPager({ info, onPage }: { info: PageInfo; onPage: (page: number) => void }) {
  const t = useAdminT()
  if (info.totalPages <= 1) return null
  return (
    <nav aria-label={t('frm.lit.pages')} className="et-pager">
      <button className="et-button" disabled={!info.hasPrevPage} onClick={() => onPage(info.page - 1)} type="button">
        {t('frm.lit.previous')}
      </button>
      <span className="et-muted">
        {t('frm.lit.page_of', { page: info.page, total: info.totalPages })}
      </span>
      <button className="et-button" disabled={!info.hasNextPage} onClick={() => onPage(info.page + 1)} type="button">
        {t('frm.lit.next')}
      </button>
    </nav>
  )
}

/** An inline status line: an error alert, or a quiet note. */
export function ResultsMessage({ kind, children }: { kind: 'error' | 'muted' | 'warning'; children: React.ReactNode }) {
  if (kind === 'error') return <p className="et-error" role="alert">{children}</p>
  return <p className={kind === 'warning' ? 'et-warning' : 'et-muted'}>{children}</p>
}
