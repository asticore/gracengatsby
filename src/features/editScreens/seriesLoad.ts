/**
 * The published dates of a repeating event's series, for the "Part of a series" list. Server only.
 * Drafts and trashed dates are not listed; the public read rule already hides drafts.
 */

export type SeriesItem = { id: number | string; title: string; slug: string; startDate: string }

export type SeriesInfo = { items: SeriesItem[] }

type SeriesEvent = { id: number | string; seriesOf?: unknown }
type SeriesEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

const relationId = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return null
}

const toItem = (doc: Record<string, unknown>): SeriesItem | null => {
  if (typeof doc.slug !== 'string' || typeof doc.startDate !== 'string') return null
  return { id: doc.id as number | string, title: typeof doc.title === 'string' ? doc.title : 'Event', slug: doc.slug, startDate: doc.startDate }
}

/** Null when the event is not part of a series and has no other dates. */
export async function loadSeries(engine: unknown, event: SeriesEvent): Promise<SeriesInfo | null> {
  const api = engine as SeriesEngine
  const rootId = relationId(event.seriesOf) ?? event.id

  const root = relationId(event.seriesOf) === null ? event : await api.findByID({ collection: 'events', id: rootId, depth: 0 }).catch((): null => null)
  const children = await api.find({
    collection: 'events',
    where: { seriesOf: { equals: rootId } },
    sort: 'startDate',
    limit: 60,
    depth: 0,
  })

  // Other dates of a password protected series member are not listed (the current event always is). A failed lookup lists only the current event.
  let hidden = new Set<number>()
  try {
    const { getProtectedIds } = await import('@/features/visibility/excludeProtected')
    hidden = await getProtectedIds('events')
  } catch {
    return null
  }
  const items = [...(root ? [root] : []), ...children.docs]
    .filter((doc) => String(doc.id) === String(event.id) || !hidden.has(Number(doc.id)))
    .map(toItem)
    .filter((item): item is SeriesItem => item !== null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)

  return items.length > 1 ? { items } : null
}
