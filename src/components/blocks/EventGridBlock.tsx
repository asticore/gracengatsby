import { EventCard } from '@/components/EventCard'
import { getPayloadClient } from '@/lib/payload'

export async function EventGridBlock({
  heading,
  showPast,
  limit,
}: {
  heading?: string | null
  showPast?: boolean | null
  limit?: number | null
}) {
  const payload = await getPayloadClient()
  const now = new Date().toISOString()

  const { docs: events } = await payload.find({
    collection: 'events',
    where: {
      and: [
        { _status: { equals: 'published' } },
        showPast ? { startDate: { less_than: now } } : { startDate: { greater_than_equal: now } },
      ],
    },
    sort: showPast ? '-startDate' : 'startDate',
    limit: limit || 3,
  })

  if (events.length === 0) return null

  return (
    <section className="home-section home-section--dark built-block built-block--eventgrid">
      <div className="page-shell">
        {heading && (
          <div className="section-heading">
            <h2>{heading}</h2>
          </div>
        )}
        <div className="event-grid">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  )
}
