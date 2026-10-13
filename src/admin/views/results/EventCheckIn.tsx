'use client'

import React, { useEffect, useState } from 'react'
import {
  countByTier,
  countCheckIns,
  filterAttendees,
  setCheckedIn,
  ticketCodeFor,
  type CheckInAttendee,
} from '@/features/editScreens/checkin'
import { formatWhen } from './rows'
import { useResultsPage } from './useResultsPage'
import './event-checkin.css'

type CheckInPayload = { event: { id: number; title: string }; attendees: CheckInAttendee[]; truncated: boolean }

/** The button on an event's RSVPs tab. It opens the check-in screen full width over the page. */
export function EventCheckInButton({ eventId }: { eventId: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="et-button" onClick={() => setOpen(true)} title="Open a full-screen list to tick guests in at the door" type="button">
        Check-in
      </button>
      {open && <EventCheckInView eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Full-screen check-in list. Loads when opened, updates the list as the user taps, and rolls a tap back if the save fails. */
function EventCheckInView({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const { data, error, loading } = useResultsPage<CheckInPayload>(`/api/admin-event-checkin?event=${eventId}`)
  // Local edits sit on top of the loaded list; null means nothing has been changed yet.
  const [local, setLocal] = useState<CheckInAttendee[] | null>(null)
  const [query, setQuery] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [saving, setSaving] = useState<Record<number, true>>({})
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const attendees = local ?? data?.attendees ?? []
  const counts = countCheckIns(attendees)
  const tiers = countByTier(attendees)
  const showTiers = tiers.some((t) => t.tier !== 'No ticket type')
  const shown = filterAttendees(attendees, query).filter((a) => !onlyPending || !a.checkedIn)

  async function toggle(attendee: CheckInAttendee) {
    const next = !attendee.checkedIn
    const before = attendees
    const at = new Date().toISOString()
    setProblem('')
    setLocal(setCheckedIn(before, attendee.id, next, next ? at : null))
    setSaving((s) => ({ ...s, [attendee.id]: true }))
    try {
      const response = await fetch('/api/admin-event-checkin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ rsvpId: attendee.id, checkedIn: next }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const saved = (await response.json()) as { checkedInAt?: string | null }
      setLocal((prev) => setCheckedIn(prev ?? before, attendee.id, next, saved.checkedInAt ?? (next ? at : null)))
    } catch {
      // Put the guest back the way it was before the tap.
      setLocal((prev) => setCheckedIn(prev ?? before, attendee.id, attendee.checkedIn, attendee.checkedInAt))
      setProblem(`Could not save ${attendee.name || ticketCodeFor(attendee.id)}. Check the connection and tap again.`)
    } finally {
      setSaving((s) => {
        const copy = { ...s }
        delete copy[attendee.id]
        return copy
      })
    }
  }

  return (
    <div aria-label="Check-in" aria-modal="true" className="eci-screen" role="dialog">
      <header className="eci-head">
        <div>
          <h2 className="eci-title">Check-in</h2>
          {data?.event.title && <p className="eci-event">{data.event.title}</p>}
        </div>
        <button className="eci-close" onClick={onClose} type="button">
          Close
        </button>
      </header>

      <div aria-live="polite" className="eci-counts">
        <p className="eci-count">
          <span className="eci-count__value">{counts.checkedIn}</span> of {counts.total} RSVPs checked in
        </p>
        <p className="eci-count">
          <span className="eci-count__value">{counts.guestsCheckedIn}</span> of {counts.guestsTotal} guests
        </p>
        {showTiers && (
          <ul className="eci-tiers">
            {tiers.map((t) => (
              <li className="eci-meta" key={t.tier}>
                {t.tier}: {t.checkedIn} of {t.total}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="eci-tools">
        <label className="eci-search">
          <span className="eci-sr">Search by name, email or ticket number</span>
          <input
            autoComplete="off"
            className="eci-input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email or ticket #"
            type="search"
            value={query}
          />
        </label>
        <label className="eci-toggle">
          <input checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} type="checkbox" />
          Only guests not yet checked in
        </label>
      </div>

      {problem && <p className="eci-error" role="alert">{problem}</p>}
      {error && <p className="eci-error" role="alert">The guest list could not be loaded. Close and open it again.</p>}
      {!error && loading && <p className="eci-muted">Loading guests...</p>}
      {data?.truncated && <p className="eci-warning">Only the first 2,000 RSVPs are listed here.</p>}
      {data && !error && attendees.length === 0 && <p className="eci-muted">No RSVPs yet.</p>}
      {data && !error && attendees.length > 0 && shown.length === 0 && <p className="eci-muted">No guests match.</p>}

      <ul className="eci-list">
        {shown.map((attendee) => (
          <li className={`eci-row${attendee.checkedIn ? ' eci-row--in' : ''}`} key={attendee.id}>
            <div className="eci-who">
              <span className="eci-name">{attendee.name || 'No name'}</span>
              <span className="eci-meta">
                {ticketCodeFor(attendee.id)}, {attendee.guestCount === 1 ? '1 guest' : `${attendee.guestCount} guests`}
              </span>
              {attendee.email && <span className="eci-meta eci-clip">{attendee.email}</span>}
              {attendee.checkedIn && attendee.checkedInAt && (
                <span className="eci-meta">Checked in {formatWhen(attendee.checkedInAt)}</span>
              )}
            </div>
            {attendee.checkedIn ? (
              <button
                className="eci-action eci-action--undo"
                disabled={Boolean(saving[attendee.id])}
                onClick={() => toggle(attendee)}
                title="Remove the check-in if this was a mistake"
                type="button"
              >
                Undo
              </button>
            ) : (
              <button
                className="eci-action"
                disabled={Boolean(saving[attendee.id])}
                onClick={() => toggle(attendee)}
                type="button"
              >
                Check in
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
