'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { AllResultsFilters, EMPTY_FILTERS, filtersToQuery, type OwnerOption, type ResultsFilterValues } from './AllResultsFilters'
import { ResultsMessage, ResultsPager, ResultsStat } from './ResultsChrome'
import { formatWhen, type AllRsvpRow, type PageInfo } from './rows'
import { useResultsPage } from './useResultsPage'

type Page = PageInfo & { docs: AllRsvpRow[] }

/**
 * The RSVPs tab on the Events list page: RSVPs of every event in one table,
 * with an event filter, search, a date range and a CSV of the filtered rows.
 */
export function AllRsvpsTab({ events }: { events: OwnerOption[] }) {
  const [filters, setFilters] = useState<ResultsFilterValues>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const query = filtersToQuery(filters, 'event')
  const { data, error, loading } = useResultsPage<Page>(`/api/admin-event-rsvps?all=1&page=${page}${query ? `&${query}` : ''}`)

  return (
    <section aria-label="All RSVPs" className="et-results">
      <AllResultsFilters
        applied={filters}
        onApply={(next) => {
          setFilters(next)
          setPage(1)
        }}
        ownerLabel="Event"
        owners={events}
        showStatus={false}
      />
      <div className="et-toolbar">
        <div className="et-stats">
          <ResultsStat label="RSVPs" value={data ? data.totalDocs.toLocaleString() : '-'} />
        </div>
        <a className="et-button" download href={`/api/admin-event-rsvps?all=1&format=csv${query ? `&${query}` : ''}`}>
          Export CSV
        </a>
      </div>

      {error && <ResultsMessage kind="error">The RSVPs could not be loaded. Reload the page to try again.</ResultsMessage>}
      {!error && loading && <ResultsMessage kind="muted">Loading RSVPs...</ResultsMessage>}
      {data && !error && data.docs.length === 0 && <ResultsMessage kind="muted">No RSVPs match.</ResultsMessage>}

      {data && !error && data.docs.length > 0 && (
        <>
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="et-num">Guests</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Registered</th>
                  <th scope="col"><span className="et-sr">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((row) => (
                  <tr key={row.id}>
                    <td className="et-clip">
                      <Link href={`/admin/collections/events/${row.eventId}`}>{row.eventTitle}</Link>
                    </td>
                    <td className="et-clip">{row.name}</td>
                    <td className="et-clip">{row.email}</td>
                    <td className="et-num">{row.guestCount}</td>
                    <td className="et-clip">{row.ticketTier || '-'}</td>
                    <td className="et-nowrap">{formatWhen(row.createdAt)}</td>
                    <td className="et-nowrap">
                      <Link href={`/admin/collections/event-rsvps/${row.id}`}>Open</Link>
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
