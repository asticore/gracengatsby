import { notFound } from 'next/navigation'
import Image from 'next/image'
import React from 'react'
import { RichText } from '@/engine/editor/react'

import { AddToCartButton } from '@/components/AddToCartButton'
import { RsvpForm } from '@/components/RsvpForm'
import { formatCurrency } from '@/lib/formatCurrency'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'
import type { EventRsvp, Media, Product } from '@/engage-types'

export const dynamic = 'force-dynamic'

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

async function getEvent(slug: string) {
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: 'events',
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
  })
  return docs[0] || null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return {}
  return buildMetadata({ title: event.title })
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const flags = await getFeatureFlags()
  if (!flags.events) notFound()

  const { slug } = await params
  const event = await getEvent(slug)

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
    <div className="page-shell">
      {cover?.url && (
        <div className="relative mb-12 aspect-[16/6] w-full bg-[var(--color-cream-dim)]">
          <Image src={cover.url} alt={cover.alt || event.title} fill style={{ objectFit: 'cover' }} />
        </div>
      )}

      <div className="grid grid-cols-[1.1fr_0.9fr] gap-14 max-[900px]:grid-cols-1">
        <div>
          <span className="text-[0.75rem] uppercase tracking-[0.1em] text-[var(--color-gold)]">
            {dateFormatter.format(new Date(event.startDate))}
          </span>
          <h1 className="text-[2.75rem]">{event.title}</h1>
          {event.location?.venueName && <p className="font-medium">{event.location.venueName}</p>}
          {event.location?.address && <p className="text-[rgba(20,17,15,0.6)]">{event.location.address}</p>}

          {event.description && (
            <div className="mt-6">
              <RichText data={event.description} />
            </div>
          )}
        </div>

        <aside className="self-start border border-[var(--color-line)] bg-white p-8">
          {event.externalRegistrationUrl ? (
            <a
              className="btn btn--primary"
              href={event.externalRegistrationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Register
            </a>
          ) : event.eventType === 'paid' ? (
            ticket ? (
              <div>
                <p className="mb-4 font-[family-name:var(--font-display)] text-[1.5rem]">
                  {formatCurrency(ticket.priceInAUD)}
                </p>
                <AddToCartButton productID={ticket.id} label="Buy ticket" />
              </div>
            ) : (
              <p className="empty-state">Ticket sales open soon.</p>
            )
          ) : (
            <RsvpForm eventID={event.id} />
          )}

          {spotsRemaining !== null && (
            <p className="mt-4 text-[0.85rem] text-[rgba(20,17,15,0.6)]">{spotsRemaining} spot(s) remaining</p>
          )}
        </aside>
      </div>
    </div>
  )
}
