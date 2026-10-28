'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { ResultsMessage, ResultsPager, ResultsStat } from './ResultsChrome'
import { cellText, formatWhen, type PageInfo, type SubmissionColumn, type SubmissionRow } from './rows'
import { useResultsPage } from './useResultsPage'

type SubmissionPage = PageInfo & { columns: SubmissionColumn[]; docs: SubmissionRow[] }

/**
 * The Submissions tab on a form's edit page: one page of entries, newest
 * first, with a column per answer field. The CSV is the existing export for
 * this form, so the file matches the one the Form Submissions screen offers.
 */
export function FormResultsTab({ formId }: { formId: number }) {
  const [page, setPage] = useState(1)
  const { data, error, loading } = useResultsPage<SubmissionPage>(`/api/admin-form-submissions?form=${formId}&page=${page}`)

  const showPayment = data !== null && data.docs.some((row) => row.paymentStatus !== 'none')

  return (
    <section aria-label="Submissions" className="et-results">
      <div className="et-toolbar">
        <div className="et-stats">
          <ResultsStat label="Entries" value={data ? data.totalDocs.toLocaleString() : '-'} />
        </div>
        <a className="et-button" download href={`/api/form-submissions/export?form=${formId}`}>
          Export CSV
        </a>
      </div>

      {error && <ResultsMessage kind="error">The entries could not be loaded. Reload the page to try again.</ResultsMessage>}
      {!error && loading && <ResultsMessage kind="muted">Loading entries...</ResultsMessage>}
      {data && !error && data.docs.length === 0 && <ResultsMessage kind="muted">No one has sent this form yet.</ResultsMessage>}

      {data && !error && data.docs.length > 0 && (
        <>
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
                  <th scope="col" className="et-nowrap">Submitted</th>
                  {data.columns.map((column) => (
                    <th key={column.name} scope="col">{column.label}</th>
                  ))}
                  {showPayment && <th scope="col">Payment</th>}
                  <th scope="col"><span className="et-sr">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((row) => (
                  <tr key={row.id}>
                    <td className="et-nowrap">{formatWhen(row.submittedAt)}</td>
                    {data.columns.map((column) => {
                      const text = cellText(row.values[column.name])
                      return (
                        <td className="et-clip" key={column.name} title={text}>
                          {text}
                        </td>
                      )
                    })}
                    {showPayment && <td className="et-nowrap">{row.paymentStatus}</td>}
                    <td className="et-nowrap">
                      <Link href={`/admin/other/form-submissions/${row.id}`}>Open</Link>
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
