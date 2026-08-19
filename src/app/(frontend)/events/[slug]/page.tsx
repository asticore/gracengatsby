import { notFound } from 'next/navigation'
import Image from 'next/image'
import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

import { AddToCartButton } from '@/components/AddToCartButton'
import { RsvpForm } from '@/components/RsvpForm'
import { formatCurrency } from '@/lib/formatCurrency'
import { getPayloadClient } from '@/lib/payload'
import type { EventRsvp, Media, Product } from '@/payload-types'

export const dynamic = 'force-dynamic'

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayloadClient()

  const { docs } = await payload.find({
    collection: 'events',
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
  })

  const event = docs[0]

  if (!event) {
    notFound()
  }

  const cover = event.coverImage && typeof event.coverImage === 'object' ? (event.coverImage as Media) : null
  const ticket =
    event.ticketProduct && typeof event.ticketProduct === 'object' ? (event.ticketProduct as Product) : null

  const guestsSoFar =
    event.rsvps?.docs?.reduce((sum: number, doc: number | EventRsvp) => {
      const guestCount = typeof doc === 'object' ? doc.guestCount : undefined
      return sum + (typeof guestCount === 'number' ? guestCount : 1)
    }, 0) || 0

  const spotsRemaining =
    typeof event.capacity === 'number' ? Math.max(event.capacity - guestsSoFar, 0) : null

  return (
    <div className="page-shell event-page">
      {cover?.url && (
        <div className="event-page__cover">
          <Image src={cover.url} alt={cover.alt || event.title} fill style={{ objectFit: 'cover' }} />
        </div>
      )}

      <div className="event-page__layout">
        <div className="event-page__main">
          <span className="event-page__date">{dateFormatter.format(new Date(event.startDate))}</span>
          <h1>{event.title}</h1>
          {event.location?.venueName && <p className="event-page__venue">{event.location.venueName}</p>}
          {event.location?.address && <p className="event-page__address">{event.location.address}</p>}

          {event.description && (
            <div className="event-page__description">
              <RichText data={event.description} />
            </div>
          )}
        </div>

        <aside className="event-page__sidebar">
          {event.externalRegistrationUrl ? (
            <a
              className="btn btn--primary event-page__register-link"
              href={event.externalRegistrationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Register
            </a>
          ) : event.eventType === 'paid' ? (
            ticket ? (
              <div className="event-page__ticket">
                <p className="event-page__price">{formatCurrency(ticket.priceInAUD)}</p>
                <AddToCartButton productID={ticket.id} label="Buy ticket" />
              </div>
            ) : (
              <p className="empty-state">Ticket sales open soon.</p>
            )
          ) : (
            <RsvpForm eventID={event.id} />
          )}

          {spotsRemaining !== null && <p className="event-page__spots">{spotsRemaining} spot(s) remaining</p>}
        </aside>
      </div>
    </div>
  )
}
