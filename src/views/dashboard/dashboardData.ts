import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type { ResolvedEntity, ResolvedGroup } from '@/components/admin/shared/resolveEntities'

/**
 * The numbers and rows behind the dashboard.
 *
 * Split out from the component so the querying is readable on its own, and so
 * a failure in any one query degrades to "no data for that tile" rather than a
 * blank admin. That matters more here than elsewhere: the dashboard is the
 * first page after login, so it is the page a half-migrated database hits
 * first.
 */

/** Collections worth a headline count, in the order they should appear. */
const STAT_SLUGS = ['pages', 'posts', 'products', 'orders', 'events', 'media'] as const

/** Collections whose recent edits are worth listing, and how to label the type. */
const ACTIVITY_SLUGS = ['pages', 'posts', 'products', 'events'] as const

export type StatTile = {
  slug: string
  label: string
  href: string
  count: number
}

export type ActivityRow = {
  id: string
  title: string
  typeLabel: string
  href: string
  status: 'published' | 'draft' | null
  updatedAt: string | null
}

const findEntity = (groups: ResolvedGroup[], slug: string): ResolvedEntity | undefined => {
  for (const group of groups) {
    const match = group.entities.find((entity) => entity.type === 'collections' && entity.slug === slug)
    if (match) return match
  }
  return undefined
}

/**
 * Counts for each headline collection the user can actually see. Runs the
 * queries together rather than in sequence - on Workers each one is a separate
 * D1 round trip, and six in series is a visible pause on first paint.
 */
export async function getStatTiles(
  engine: Payload,
  groups: ResolvedGroup[],
  req?: PayloadRequest,
): Promise<StatTile[]> {
  const targets = STAT_SLUGS.map((slug) => findEntity(groups, slug)).filter(
    (entity): entity is ResolvedEntity => Boolean(entity),
  )

  const counts = await Promise.all(
    targets.map((entity) =>
      engine
        .count({ collection: entity.slug as CollectionSlug, req, overrideAccess: false })
        .then((result) => result.totalDocs)
        .catch((): null => null),
    ),
  )

  return targets
    .map((entity, index) => ({ entity, count: counts[index] }))
    .filter((row): row is { entity: ResolvedEntity; count: number } => row.count !== null)
    .map(({ entity, count }) => ({
      slug: entity.slug,
      label: entity.label,
      href: entity.href,
      count,
    }))
}

/**
 * The most recently edited documents across the main content collections,
 * merged into one list. This is the piece the old dashboard had no equivalent
 * of: a card grid tells you what exists, not what changed.
 */
export async function getRecentActivity(
  engine: Payload,
  groups: ResolvedGroup[],
  limit: number,
  req?: PayloadRequest,
): Promise<ActivityRow[]> {
  const targets = ACTIVITY_SLUGS.map((slug) => findEntity(groups, slug)).filter(
    (entity): entity is ResolvedEntity => Boolean(entity),
  )

  const results = await Promise.all(
    targets.map((entity) =>
      engine
        .find({
          collection: entity.slug as CollectionSlug,
          depth: 0,
          limit,
          sort: '-updatedAt',
          req,
          overrideAccess: false,
        })
        .then((result) => ({ entity, docs: result.docs }))
        .catch(() => ({ entity, docs: [] as Record<string, unknown>[] })),
    ),
  )

  const rows: ActivityRow[] = []

  for (const { entity, docs } of results) {
    for (const doc of docs as Record<string, unknown>[]) {
      const status = doc._status
      rows.push({
        id: `${entity.slug}-${String(doc.id)}`,
        // Collections here use `title` or `name`; fall back to the id so a row
        // is never a blank link.
        title:
          (typeof doc.title === 'string' && doc.title) ||
          (typeof doc.name === 'string' && doc.name) ||
          `Untitled #${String(doc.id)}`,
        typeLabel: entity.singular,
        href: `${entity.href}/${String(doc.id)}`,
        status: status === 'published' || status === 'draft' ? status : null,
        updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      })
    }
  }

  return rows
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, limit)
}

/**
 * "3 hours ago" and friends. Deliberately hand-rolled: Intl.RelativeTimeFormat
 * is available on Workers, but this only needs six thresholds and this way the
 * output reads the same everywhere without a locale round trip.
 */
export function formatRelativeTime(value: string | null, now: number): string {
  if (!value) return '-'

  const then = Date.parse(value)
  if (Number.isNaN(then)) return '-'

  const seconds = Math.max(0, Math.round((now - then) / 1000))

  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`

  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`

  const months = Math.round(days / 30)
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`

  const years = Math.round(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

/** Time-of-day greeting, so the first line of the portal is not a static label. */
export function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
