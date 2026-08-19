import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import type { Event, Media } from '@/payload-types'

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const getImageURL = (event: Event): string | null => {
  if (event.coverImage && typeof event.coverImage === 'object') {
    return (event.coverImage as Media).url ?? null
  }
  return null
}

export const EventCard: React.FC<{ event: Event }> = ({ event }) => {
  const imageURL = getImageURL(event)

  return (
    <Link href={`/events/${event.slug}`} className="event-card">
      <div className="event-card__image">
        {imageURL ? (
          <Image
            src={imageURL}
            alt={event.title}
            width={480}
            height={320}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div className="event-card__placeholder" aria-hidden />
        )}
        <span className="event-card__tag">{event.eventType === 'paid' ? 'Ticketed' : 'RSVP'}</span>
      </div>
      <div className="event-card__body">
        <span className="event-card__date">{dateFormatter.format(new Date(event.startDate))}</span>
        <h3>{event.title}</h3>
        {event.location?.venueName && <p>{event.location.venueName}</p>}
      </div>
    </Link>
  )
}
