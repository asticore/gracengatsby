import { getEngine } from '@/engine'
import { getFeatureFlags } from '@/utilities/features'
import { icsFromEvent, type IcsEventSource } from '@/features/editScreens/ics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/events/:slug/ics - the event as an iCalendar file.
 * 404 when the events feature is off, the event is unknown, not published,
 * in the trash, or has no start date. Public: anyone can read a published event.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404 })

  const flags = await getFeatureFlags()
  if (!flags.events) return notFound()

  const { slug } = await params
  const engine = await getEngine()
  const { docs } = (await engine.find({
    collection: 'events',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
    depth: 0,
    limit: 1,
  })) as unknown as { docs: (IcsEventSource & { trashedAt?: string | null })[] }

  const event = docs[0]
  if (!event || event.trashedAt) return notFound()

  const ics = icsFromEvent(event, new URL(request.url).origin)
  if (!ics) return notFound()

  const filename = slug.replace(/[^a-z0-9-]/gi, '') || 'event'
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}.ics"`,
      'cache-control': 'public, max-age=0, s-maxage=600',
    },
  })
}
