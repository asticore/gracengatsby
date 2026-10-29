'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import Link from 'next/link'
import React, { useState } from 'react'
import { AllResultsFilters, EMPTY_FILTERS, filtersToQuery, type OwnerOption, type ResultsFilterValues } from './AllResultsFilters'
import { ResultsMessage, ResultsPager, ResultsStat } from './ResultsChrome'
import { formatWhen, type AllSubmissionRow, type PageInfo } from './rows'
import type { UiStringKey } from '@/features/uiStrings'
import { useResultsPage } from './useResultsPage'

type Page = PageInfo & { docs: AllSubmissionRow[] }

const PAYMENT_KEYS: Record<string, UiStringKey> = { unpaid: 'frm.lit.awaiting_payment', paid: 'frm.lit.paid' }

function paymentLabel(t: (key: UiStringKey) => string, status: string): string {
  if (status === 'none') return '-'
  const key = PAYMENT_KEYS[status]
  return key ? t(key) : status
}

/**
 * The Submissions tab on the Forms list page: entries from every form in one
 * table, with a form filter, payment status, search, date range, a CSV of the
 * filtered rows, and a link to each entry and its form.
 */
export function AllSubmissionsTab({ forms }: { forms: OwnerOption[] }) {
  const t = useAdminT()
  const [filters, setFilters] = useState<ResultsFilterValues>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const query = filtersToQuery(filters, 'form')
  const { data, error, loading } = useResultsPage<Page>(`/api/admin-form-submissions?all=1&page=${page}${query ? `&${query}` : ''}`)

  return (
    <section aria-label={t('frm.lit.all_submissions')} className="et-results">
      <AllResultsFilters
        applied={filters}
        onApply={(next) => {
          setFilters(next)
          setPage(1)
        }}
        ownerLabel="Form"
        owners={forms}
        showStatus
      />
      <div className="et-toolbar">
        <div className="et-stats">
          <ResultsStat label={t('frm.lit.entries')} value={data ? data.totalDocs.toLocaleString() : '-'} />
        </div>
        <a className="et-button" download href={`/api/admin-form-submissions?all=1&format=csv${query ? `&${query}` : ''}`}>
          {t('frm.lit.export_csv')}
        </a>
      </div>

      {error && <ResultsMessage kind="error">{t('frm.lit.entries_load_error')}</ResultsMessage>}
      {!error && loading && <ResultsMessage kind="muted">{t('frm.lit.loading_entries')}</ResultsMessage>}
      {data && !error && data.docs.length === 0 && <ResultsMessage kind="muted">{t('frm.lit.no_entries_match')}</ResultsMessage>}

      {data && !error && data.docs.length > 0 && (
        <>
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
                  <th scope="col" className="et-nowrap">{t('frm.lit.submitted')}</th>
                  <th scope="col">{t('frm.lit.form')}</th>
                  <th scope="col">{t('frm.lit.answers')}</th>
                  <th scope="col">{t('frm.lit.payment')}</th>
                  <th scope="col"><span className="et-sr">{t('frm.lit.open')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((row) => (
                  <tr key={row.id}>
                    <td className="et-nowrap">{formatWhen(row.submittedAt)}</td>
                    <td className="et-clip">
                      <Link href={`/admin/content/forms/${row.formId}`}>{row.formTitle}</Link>
                    </td>
                    <td className="et-clip" title={row.summary}>{row.summary}</td>
                    <td className="et-nowrap">{paymentLabel(t, row.paymentStatus)}</td>
                    <td className="et-nowrap">
                      <Link href={`/admin/other/form-submissions/${row.id}`}>{t('frm.lit.open_entry')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResultsPager info={data} onPage={setPage} />
        </>
      )}
    </section>
  )
}
