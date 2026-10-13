import { parseTiers } from './tiers'
import { tierViews, type TierView, type TierSaleRow } from './tierSales'

type CountEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: TierSaleRow[] }>
}

/**
 * The ticket types of a published event with how many places each has left. Reads every RSVP
 * with overrideAccess so the counts are right for a visitor, who cannot read the RSVP list.
 * Only counts are returned, never the people who booked.
 */
export async function loadTierViews(engine: unknown, event: { id: number | string; ticketTiers?: unknown }): Promise<TierView[]> {
  const tiers = parseTiers(event.ticketTiers)
  if (tiers.length === 0) return []
  const { docs } = await (engine as CountEngine).find({
    collection: 'event-rsvps',
    where: { event: { equals: event.id } },
    depth: 0,
    limit: 0,
    overrideAccess: true,
  })
  return tierViews(tiers, docs)
}