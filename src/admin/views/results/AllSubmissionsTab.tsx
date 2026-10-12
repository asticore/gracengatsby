'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { AllResultsFilters, EMPTY_FILTERS, filtersToQuery, type OwnerOption, type ResultsFilterValues } from './AllResultsFilters'
import { ResultsMessage, ResultsPager, ResultsStat } from './ResultsChrome'
import { formatWhen, type AllSubmissionRow, type PageInfo } from './rows'
import { useResultsPage } from './useResultsPage'

type Page = PageInfo & { docs: AllSubmissionRow[] }

const PAYMENT_LABELS: Record<string, string> = { none: '-', unpaid: 'Awaiting payment', paid: 'Paid' }

/**
 * The Submissions tab on the Forms list page: entries from every form in one
 * table, with a form filter, payment status, search, date range, a CSV of the
 * filtered rows, and a link to each entry and its form.
 */
export function AllSubmissionsTab({ forms }: { forms: OwnerOption[] }) {
  const [filters, setFilters] = useState<ResultsFilterValues>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const query = filtersToQuery(filters, 'form')
  const { data, error, loading } = useResultsPage<Page>(`/api/admin-form-submissions?all=1&page=${page}${query ? `&${query}` : ''}`)

  return (
    <section aria-label="All submissions" className="et-results">
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
          <ResultsStat label="Entries" value={data ? data.totalDocs.toLocaleString() : '-'} />
        </div>
        <a className="et-button" download href={`/api/admin-form-submissions?all=1&format=csv${query ? `&${query}` : ''}`}>
          Export CSV
        </a>
      </div>

      {error && <ResultsMessage kind="error">The entries could not be loaded. Reload the page to try again.</ResultsMessage>}
      {!error && loading && <ResultsMessage kind="muted">Loading entries...</ResultsMessage>}
      {data && !error && data.docs.length === 0 && <ResultsMessage kind="muted">No entries match.</ResultsMessage>}

      {data && !error && data.docs.length > 0 && (
        <>
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
                  <th scope="col" className="et-nowrap">Submitted</th>
                  <th scope="col">Form</th>
                  <th scope="col">Answers</th>
                  <th scope="col">Payment</th>
                  <th scope="col"><span className="et-sr">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((row) => (
                  <tr key={row.id}>
                    <td className="et-nowrap">{formatWhen(row.submittedAt)}</td>
                    <td className="et-clip">
                      <Link href={`/admin/collections/forms/${row.formId}`}>{row.formTitle}</Link>
                    </td>
                    <td className="et-clip" title={row.summary}>{row.summary}</td>
                    <td className="et-nowrap">{PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus}</td>
                    <td className="et-nowrap">
                      <Link href={`/admin/collections/form-submissions/${row.id}`}>Open entry</Link>
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
