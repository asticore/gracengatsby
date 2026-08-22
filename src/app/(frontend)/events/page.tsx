import { notFound } from 'next/navigation'
import React from 'react'

import { EventCard } from '@/components/EventCard'
import { getPayloadClient } from '@/lib/payload'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'

export async function generateMetadata() {
  return buildMetadata({ title: 'Events' })
}

export const dynamic = 'force-dynamic'

export default async function EventsPage() {
  const flags = await getFeatureFlags()
  if (!flags.events) notFound()

  const payload = await getPayloadClient()

  const now = new Date().toISOString()

  const [{ docs: upcoming }, { docs: past }] = await Promise.all([
    payload.find({
      collection: 'events',
      where: {
        and: [{ _status: { equals: 'published' } }, { startDate: { greater_than_equal: now } }],
      },
      sort: 'startDate',
      limit: 100,
    }),
    payload.find({
      collection: 'events',
      where: {
        and: [{ _status: { equals: 'published' } }, { startDate: { less_than: now } }],
      },
      sort: '-startDate',
      limit: 12,
    }),
  ])

  return (
    <div className="page-shell events-page">
      <header className="page-header">
        <h1>Events</h1>
        <p>Trunk shows, styling nights, and gatherings worth putting on the calendar.</p>
      </header>

      {upcoming.length === 0 ? (
        <p className="empty-state">
          No events on the calendar right now - check back soon, or add one from the admin panel.
        </p>
      ) : (
        <div className="event-grid">
          {upcoming.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-subheading">Past events</h2>
          <div className="event-grid event-grid--past">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
