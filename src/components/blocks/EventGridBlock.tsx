import { EventCard } from '@/components/EventCard'
import { getEngine } from '@/lib/engine'
import type { Event } from '@/engage-types'

export async function EventGridBlock({
  heading,
  showPast,
  limit,
}: {
  heading?: string | null
  showPast?: boolean | null
  limit?: number | null
}) {
  const engine = await getEngine()
  const now = new Date().toISOString()

  const { docs: events } = (await engine.find({
    collection: 'events',
    where: {
      and: [
        { _status: { equals: 'published' } },
        showPast ? { startDate: { less_than: now } } : { startDate: { greater_than_equal: now } },
      ],
    },
    sort: showPast ? '-startDate' : 'startDate',
    limit: limit || 3,
  })) as unknown as { docs: Event[] }

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
