import Image from 'next/image'
import Link from 'next/link'

import type { Event, Media } from '@/engage-types'
import { loadSiteDetails } from '@/features/site/details'
import { formatDate } from '@/features/site/format'

const getImageURL = (event: Event): string | null => {
  if (event.coverImage && typeof event.coverImage === 'object') {
    return (event.coverImage as Media).url ?? null
  }
  return null
}

/** A server component: the date and time zone come from Site details. Cards use the short-month form of the chosen style. */
export const EventCard = async ({ event }: { event: Event }) => {
  const imageURL = getImageURL(event)
  const details = await loadSiteDetails()

  return (
    <Link href={`/events/${event.slug}`} className="block border border-[var(--color-line)] bg-white">
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--color-cream-dim)]">
        {imageURL ? (
          <Image
            src={imageURL}
            alt={event.title}
            width={480}
            height={320}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <div
            className="h-full w-full bg-[image:linear-gradient(135deg,var(--color-cream-dim),var(--color-gold-light))]"
            aria-hidden
          />
        )}
        <span className="absolute left-3 top-3 bg-[var(--color-ink)] px-3 py-1 text-[0.7rem] uppercase tracking-[0.08em] text-[var(--color-cream)]">
          {event.eventType === 'paid' ? 'Ticketed' : 'RSVP'}
        </span>
      </div>
      <div className="p-5">
        <span className="text-[0.7rem] uppercase tracking-[0.08em] text-[var(--color-gold)]">
          {formatDate(event.startDate, details, { compact: true })}
        </span>
        <h3>{event.title}</h3>
        {event.location?.venueName && <p>{event.location.venueName}</p>}
        {(event as Event & { seriesOf?: unknown }).seriesOf ? (
          <p className="text-[0.8rem] text-[rgba(20,17,15,0.6)]">Part of a series</p>
        ) : null}
      </div>
    </Link>
  )
}
