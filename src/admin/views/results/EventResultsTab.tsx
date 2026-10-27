'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { EventCheckInButton } from './EventCheckIn'
import { ResultsMessage, ResultsPager, ResultsStat } from './ResultsChrome'
import { formatWhen, type PageInfo, type RsvpRow } from './rows'
import { useResultsPage } from './useResultsPage'

type RsvpPage = PageInfo & { docs: RsvpRow[]; totalGuests: number; guestsTruncated: boolean }

/**
 * The RSVPs tab on an event's edit page: counts, a CSV export, and one page of
 * RSVPs with a link to each one's own document.
 */
export function EventResultsTab({ eventId, capacity }: { eventId: number; capacity: number | null }) {
  const [page, setPage] = useState(1)
  const { data, error, loading } = useResultsPage<RsvpPage>(`/api/admin-event-rsvps?event=${eventId}&page=${page}`)

  const overCapacity = data !== null && capacity !== null && data.totalGuests > capacity

  return (
    <section aria-label="RSVPs" className="et-results">
      <div className="et-toolbar">
        <div className="et-stats">
          <ResultsStat label="RSVPs" value={data ? data.totalDocs.toLocaleString() : '-'} />
          <ResultsStat
            label="Guests"
            value={data ? `${data.totalGuests.toLocaleString()}${data.guestsTruncated ? '+' : ''}` : '-'}
          />
          {capacity !== null && <ResultsStat label="Capacity" value={capacity.toLocaleString()} />}
        </div>
        <EventCheckInButton eventId={eventId} />
        <a className="et-button" download href={`/api/admin-event-rsvps?event=${eventId}&format=csv`}>
          Export CSV
        </a>
      </div>

      {overCapacity && <ResultsMessage kind="warning">There are more guests than the capacity set on this event.</ResultsMessage>}
      {error && <ResultsMessage kind="error">The RSVPs could not be loaded. Reload the page to try again.</ResultsMessage>}
      {!error && loading && <ResultsMessage kind="muted">Loading RSVPs...</ResultsMessage>}

      {data && !error && data.docs.length === 0 && <ResultsMessage kind="muted">No RSVPs yet.</ResultsMessage>}

      {data && !error && data.docs.length > 0 && (
        <>
          <div className="et-table-wrap">
            <table className="et-table">
              <thead>
                <tr>
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
                    <td className="et-clip">{row.name}</td>
                    <td className="et-clip">{row.email}</td>
                    <td className="et-num">{row.guestCount}</td>
                    <td className="et-clip">{row.ticketTier || '-'}</td>
                    <td className="et-nowrap">{formatWhen(row.createdAt)}</td>
                    <td className="et-nowrap">
                      <Link href={`/admin/other/event-rsvps/${row.id}`}>Open</Link>
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
