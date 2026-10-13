/**
 * Plans the child events ("occurrences") for a repeating event. Pure: the route
 * reads the parent and the existing children, passes them in, and creates what
 * this returns. Running it twice creates nothing the second time.
 */

import { expandRecurrence, type RecurrenceRule } from './recurrence'
import { EVENT_TIME_ZONE, localDateIn } from './timeZone'
import { parseTiers } from './tiers'

/** The parent event fields a child copies. Relationship fields may arrive as ids or objects. */
export type GenerateParent = {
  id: number | string
  title?: string | null
  slug?: string | null
  startDate?: string | null
  endDate?: string | null
  summary?: string | null
  description?: unknown
  coverImage?: unknown
  location?: { venueName?: string | null; address?: string | null; isOnline?: boolean | null } | null
  eventType?: string | null
  capacity?: number | null
  ticketTiers?: unknown
}

export type PlannedChild = { date: string; slug: string; data: Record<string, unknown> }

export type GeneratePlan = {
  create: PlannedChild[]
  /** Dates left alone because an occurrence already exists for them (or its slug is taken). */
  skipped: number
  truncated: boolean
}

const relationId = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return null
}

/** Slug for an occurrence: the parent slug and the date, e.g. styling-night-2026-10-20. */
export function childSlug(parentSlug: string, date: string): string {
  const base = parentSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'event'}-${date}`
}

/** The stored fields for one occurrence. It starts as a draft and links back to the parent. */
export function childData(parent: GenerateParent, start: Date, end: Date | null): Record<string, unknown> {
  const location = parent.location
  return {
    title: parent.title ?? 'Event',
    summary: parent.summary ?? null,
    description: parent.description ?? null,
    coverImage: relationId(parent.coverImage),
    location: location
      ? { venueName: location.venueName ?? null, address: location.address ?? null, isOnline: Boolean(location.isOnline) }
      : undefined,
    eventType: parent.eventType ?? 'free',
    capacity: typeof parent.capacity === 'number' ? parent.capacity : null,
    ticketTiers: parseTiers(parent.ticketTiers),
    startDate: start.toISOString(),
    endDate: end ? end.toISOString() : null,
    seriesOf: relationId(parent.id),
    _status: 'draft',
  }
}

/**
 * Which occurrences to create. `existingDates` are the local dates of children
 * already there; `takenSlugs` are slugs in use anywhere. The parent's own date is
 * the first occurrence and is left out without being counted.
 */
export function planOccurrences(input: {
  parent: GenerateParent
  rule: RecurrenceRule
  existingDates: Set<string>
  takenSlugs: Set<string>
  timeZone?: string
}): GeneratePlan {
  const timeZone = input.timeZone ?? EVENT_TIME_ZONE
  const start = input.parent.startDate ? new Date(input.parent.startDate) : null
  if (!start || Number.isNaN(start.getTime())) return { create: [], skipped: 0, truncated: false }
  const end = input.parent.endDate ? new Date(input.parent.endDate) : null
  const parentDate = localDateIn(start, timeZone)
  const slugBase = input.parent.slug || 'event'

  const { occurrences, truncated } = expandRecurrence({
    start,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
    rule: input.rule,
    timeZone,
  })

  const create: PlannedChild[] = []
  let skipped = 0
  for (const occurrence of occurrences) {
    if (occurrence.date === parentDate) continue
    const slug = childSlug(slugBase, occurrence.date)
    if (input.existingDates.has(occurrence.date) || input.takenSlugs.has(slug)) {
      skipped += 1
      continue
    }
    create.push({ date: occurrence.date, slug, data: childData(input.parent, occurrence.start, occurrence.end) })
  }
  return { create, skipped, truncated }
}
