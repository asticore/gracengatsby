import { getEngine } from '@/lib/engine'

import { toPublicEvent, type PublicTrackingEvent } from './publicEvent'
import { TRACKING_EVENTS_SLUG } from './slugs'

export type { PublicTrackingEvent } from './publicEvent'

const CACHE_MS = 60_000
let cache: { at: number; events: PublicTrackingEvent[] } | null = null

/** Enabled, valid events for the public site. Cached for a minute per server instance. Never throws. */
export async function getPublicTrackingEvents(): Promise<PublicTrackingEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events
  try {
    const engine = await getEngine()
    const { docs } = (await engine.find({
      collection: TRACKING_EVENTS_SLUG,
      where: { enabled: { equals: true } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })) as { docs: Record<string, unknown>[] }
    const events = docs.map(toPublicEvent).filter((event): event is PublicTrackingEvent => event !== null)
    cache = { at: Date.now(), events }
    return events
  } catch {
    return []
  }
}
