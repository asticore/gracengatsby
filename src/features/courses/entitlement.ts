import type { Engine, TypedUser, Where } from '@/engine'

import type { FeatureFlags } from '@/features/registry'

import {
  COURSES_SLUG,
  ENROLMENTS_SLUG,
  MEMBERSHIPS_SLUG,
  type CourseAccessType,
  type Entitlement,
} from './types'

/**
 * The minimum a course has to tell us before we can answer "may this person
 * open it?". Deliberately not the generated `Course` type: this module is
 * called from collection access functions that run before types are
 * regenerated, and from the front end with depth-0 documents.
 */
export type CourseLike = {
  id: number
  accessType?: CourseAccessType | null
  product?: number | { id: number } | null
  tierSlug?: string | null
}

type MaybeUser = TypedUser | null | undefined

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

export const isAdminUser = (user: MaybeUser): boolean =>
  Boolean((user as { roles?: string[] } | null | undefined)?.roles?.includes('admin'))

/** Orders that represent money actually taken, as opposed to abandoned or reversed. */
const PAID_ORDER_STATUSES = ['processing', 'completed']

/**
 * Tier slugs the learner currently holds, read from the members feature by
 * collection slug rather than by import.
 *
 * Returns null - not an empty list - when membership cannot be determined at
 * all, so the caller can tell "you hold no tiers" apart from "there is no
 * membership system here", which are different messages to show a learner.
 *
 * The shape of a membership document belongs to the members feature, so it is
 * read defensively: whichever of the plausible spellings carries the tier slug
 * is used, and anything unrecognised counts as no tier rather than an error.
 */
export const heldTierSlugs = async (
  engine: Engine,
  user: MaybeUser,
  flags: FeatureFlags,
): Promise<string[] | null> => {
  if (!user) return null
  if (!flags.members) return null
  if (!(engine.collections as Record<string, unknown> | undefined)?.[MEMBERSHIPS_SLUG]) return null

  try {
    const { docs } = await engine.find({
      collection: MEMBERSHIPS_SLUG as 'users',
      where: { user: { equals: user.id } } as Where,
      limit: 25,
      depth: 1,
      overrideAccess: true,
    })

    const slugs: string[] = []
    for (const raw of docs as unknown as Record<string, unknown>[]) {
      const status = typeof raw.status === 'string' ? raw.status : 'active'
      if (status !== 'active') continue

      const tier = raw.tier
      const slug =
        (tier && typeof tier === 'object' && typeof (tier as { slug?: unknown }).slug === 'string'
          ? (tier as { slug: string }).slug
          : null) ?? (typeof raw.tierSlug === 'string' ? raw.tierSlug : null)

      if (slug) slugs.push(slug)
    }
    return slugs
  } catch {
    // The members feature is mid-build; a query against a table that does not
    // exist yet must not take the course pages down with it.
    return null
  }
}

/** True when the learner has a paid order containing the course's product. */
const hasPurchased = async (engine: Engine, user: MaybeUser, productId: number): Promise<boolean> => {
  if (!user) return false
  try {
    const { totalDocs } = await engine.find({
      collection: 'orders',
      where: {
        and: [
          { customer: { equals: user.id } },
          { status: { in: PAID_ORDER_STATUSES } },
          { 'items.product': { equals: productId } },
        ],
      },
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    return totalDocs > 0
  } catch {
    return false
  }
}

/** True when an active enrolment row already grants the course. */
const hasEnrolment = async (engine: Engine, user: MaybeUser, courseId: number): Promise<boolean> => {
  if (!user) return false
  try {
    const { totalDocs } = await engine.find({
      collection: ENROLMENTS_SLUG as 'users',
      where: {
        and: [
          { user: { equals: user.id } },
          { course: { equals: courseId } },
          { status: { in: ['active', 'completed'] } },
        ],
      } as Where,
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
    return totalDocs > 0
  } catch {
    return false
  }
}

/**
 * The single answer to "may this person open this course's lessons?".
 *
 * Every other check in the feature - the collection access functions, the
 * lesson page, the mark-complete action - funnels through here, so there is
 * exactly one place where the rule lives and exactly one place to get it wrong.
 */
export const entitlementFor = async (
  engine: Engine,
  course: CourseLike,
  user: MaybeUser,
  flags: FeatureFlags,
): Promise<Entitlement> => {
  if (isAdminUser(user)) return { granted: true, reason: 'admin' }

  const accessType: CourseAccessType = course.accessType ?? 'free'

  if (accessType === 'free') return { granted: true, reason: 'free' }

  if (!user) return { granted: false, reason: 'anonymous' }

  // An explicit enrolment overrides the gate for every paid access type: it is
  // how a staff member hands someone a seat, and how a completed purchase is
  // recorded once so the order does not have to be re-scanned on every page.
  if (await hasEnrolment(engine, user, course.id)) return { granted: true, reason: 'enrolled' }

  if (accessType === 'purchase') {
    const productId = idOf(course.product)
    if (productId && (await hasPurchased(engine, user, productId))) {
      return { granted: true, reason: 'purchased' }
    }
    return { granted: false, reason: 'payment-required' }
  }

  const held = await heldTierSlugs(engine, user, flags)
  if (held === null) return { granted: false, reason: 'tier-unavailable' }
  if (course.tierSlug && held.includes(course.tierSlug)) return { granted: true, reason: 'tier' }
  return { granted: false, reason: 'tier-required' }
}

/**
 * Every course id this person may open, as a list.
 *
 * Used to build the `where` clause that the Lessons collection enforces, which
 * is why it returns ids rather than documents: the clause has to be expressible
 * to the database, not evaluated in application code after the rows are already
 * on their way out.
 *
 * Written as three bulk lookups rather than a loop over `entitlementFor`,
 * because this runs on every lesson read - a query per course would make the
 * cost of listing lessons grow with the size of the catalogue.
 */
export const accessibleCourseIds = async (
  engine: Engine,
  user: MaybeUser,
  flags: FeatureFlags,
): Promise<number[]> => {
  const { docs } = await engine.find({
    collection: COURSES_SLUG as 'users',
    where: { _status: { equals: 'published' } } as Where,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const courses = docs as unknown as CourseLike[]
  const granted = new Set<number>()
  const paid: CourseLike[] = []

  for (const course of courses) {
    if ((course.accessType ?? 'free') === 'free') granted.add(course.id)
    else paid.push(course)
  }

  if (!user || paid.length === 0) return [...granted]

  const [enrolments, orders, held] = await Promise.all([
    engine
      .find({
        collection: ENROLMENTS_SLUG as 'users',
        where: {
          and: [{ user: { equals: user.id } }, { status: { in: ['active', 'completed'] } }],
        } as Where,
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as unknown[] })),
    engine
      .find({
        collection: 'orders',
        where: {
          and: [{ customer: { equals: user.id } }, { status: { in: PAID_ORDER_STATUSES } }],
        },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as unknown[] })),
    heldTierSlugs(engine, user, flags),
  ])

  const enrolled = new Set<number>()
  for (const row of enrolments.docs as unknown as { course?: unknown }[]) {
    const id = idOf(row.course)
    if (id !== null) enrolled.add(id)
  }

  const purchasedProducts = new Set<number>()
  for (const order of orders.docs as unknown as { items?: { product?: unknown }[] | null }[]) {
    for (const item of order.items ?? []) {
      const id = idOf(item?.product)
      if (id !== null) purchasedProducts.add(id)
    }
  }

  for (const course of paid) {
    if (enrolled.has(course.id)) {
      granted.add(course.id)
      continue
    }
    if (course.accessType === 'purchase') {
      const productId = idOf(course.product)
      if (productId !== null && purchasedProducts.has(productId)) granted.add(course.id)
      continue
    }
    if (course.accessType === 'tier' && held && course.tierSlug && held.includes(course.tierSlug)) {
      granted.add(course.id)
    }
  }

  return [...granted]
}
