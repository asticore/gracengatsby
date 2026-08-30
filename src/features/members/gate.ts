import type { EngineQuery } from './entitlement'
import type { GateVerdict, MemberSettings, MembershipTierDoc } from './types'
import type { MembersOnlyValue } from './gateField'

import { resolveEntitlement } from './entitlement'
import { MEMBERSHIP_TIERS_SLUG } from './slugs'

/**
 * The gate. Everything a non-member is not allowed to see is removed here, on
 * the server, before the document reaches the renderer.
 *
 * The important decision in this file is that "blur" withholds the body too.
 * The setting describes blur as appearance-only, and if the body were shipped
 * that would be exactly true - CSS is not access control, and "view source"
 * defeats it in one keystroke. So all three teaser modes send the same thing:
 * at most a short teaser. Blur only changes how that teaser is presented. The
 * warning on the setting stays conservative rather than wrong, and no mode can
 * leak the content.
 */

type GateUser = { id: number | string; roles?: string[] | null } | null | undefined

export type GateableDoc = {
  membersOnly?: MembersOnlyValue | null
  [key: string]: unknown
}

const tierOf = (value: MembersOnlyValue['tier']): MembershipTierDoc | null =>
  value && typeof value === 'object' && 'rank' in (value as object) ? (value as MembershipTierDoc) : null

/**
 * Any member gets in when no tier is named, so an un-named requirement is rank
 * 1, not rank 0 - rank 0 is "not a member" and would let anonymous readers
 * through.
 */
const MINIMUM_MEMBER_RANK = 1

const denied = (
  settings: MemberSettings,
  reason: GateVerdict['reason'],
  tier: MembershipTierDoc | null,
): GateVerdict => ({
  allowed: false,
  gated: true,
  teaser: settings.access.teaserMode,
  redirectTo: settings.access.membersOnlyRedirect,
  requiredTierSlug: tier?.slug ?? null,
  requiredTierName: tier?.name ?? null,
  reason,
})

const allowed = (settings: MemberSettings, gated: boolean, reason: GateVerdict['reason']): GateVerdict => ({
  allowed: true,
  gated,
  teaser: null,
  redirectTo: settings.access.membersOnlyRedirect,
  requiredTierSlug: null,
  requiredTierName: null,
  reason,
})

/**
 * Decides whether this reader may see this document.
 *
 * Fails OPEN when the feature is switched off, and only then: a site that has
 * never turned Members on has no members, so locking its pages behind a
 * membership nobody can hold would take the site down. Every other uncertainty
 * (no user, unreadable membership, unknown tier) fails closed.
 */
export const evaluateGate = async (args: {
  engine: EngineQuery
  doc: GateableDoc | null | undefined
  user: GateUser
  settings: MemberSettings
  now?: Date
}): Promise<GateVerdict> => {
  const { engine, doc, user, settings, now = new Date() } = args

  const gate = doc?.membersOnly
  if (!gate?.enabled) return allowed(settings, false, 'not-gated')
  if (!settings.featureEnabled) return allowed(settings, true, 'feature-off')

  // An admin editing the site has to be able to look at what they locked.
  if (user?.roles?.includes('admin')) return allowed(settings, true, 'admin')

  let required = tierOf(gate.tier)
  if (!required && (typeof gate.tier === 'number' || typeof gate.tier === 'string')) {
    // depth: 0 reads leave the relationship as a bare id. Resolve it rather
    // than treating an unresolved tier as "no requirement", which would open
    // the document to anyone.
    const { docs } = await engine
      .find({
        collection: MEMBERSHIP_TIERS_SLUG,
        where: { id: { equals: gate.tier } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch((): { docs: unknown[] } => ({ docs: [] }))
    required = (docs[0] as MembershipTierDoc) ?? null
  }

  const requiredRank =
    typeof required?.rank === 'number' && required.rank > 0 ? required.rank : MINIMUM_MEMBER_RANK

  if (!user) return denied(settings, 'not-signed-in', required)

  const entitlement = await resolveEntitlement(engine, user.id, now)
  if (entitlement.rank <= 0) return denied(settings, 'no-membership', required)
  if (entitlement.rank < requiredRank) return denied(settings, 'tier-too-low', required)

  return allowed(settings, true, 'member')
}

/**
 * Fields that carry the body of a document across Pages, Posts and Products.
 * Listed explicitly rather than "everything except a few" so that a field
 * someone adds later is not published to non-members by default.
 */
const BODY_FIELDS = ['content', 'blocks', 'layout', 'description', 'richText', 'sections']

const TEASER_CHARS = 400

/** Pulls readable text out of a Lexical document without rendering it. */
const plainText = (node: unknown, out: string[] = [], budget = TEASER_CHARS * 3): string[] => {
  if (out.join(' ').length >= budget || node === null || typeof node !== 'object') return out
  const record = node as Record<string, unknown>
  if (typeof record.text === 'string') out.push(record.text)
  const children = record.children ?? (record.root as Record<string, unknown> | undefined)
  if (Array.isArray(children)) {
    for (const child of children) plainText(child, out, budget)
  } else if (children && typeof children === 'object') {
    plainText(children, out, budget)
  }
  return out
}

const buildTeaser = (doc: GateableDoc): string => {
  const excerpt = doc.excerpt ?? doc.shortDescription ?? doc.summary
  if (typeof excerpt === 'string' && excerpt.trim()) return excerpt.trim()

  const words = plainText(doc.content ?? doc.description).join(' ').replace(/\s+/g, ' ').trim()
  if (!words) return ''
  return words.length > TEASER_CHARS ? `${words.slice(0, TEASER_CHARS).trimEnd()}...` : words
}

export type GatedDoc<T> = {
  doc: T
  gate: GateVerdict
  /** Present only when the reader was refused and the mode shows a teaser. */
  teaserText: string | null
}

/**
 * Returns the document as this reader is allowed to receive it.
 *
 * The refused copy is built by deleting the body fields from a shallow clone,
 * so the values never reach the response at all - there is nothing in the HTML,
 * the serialised server-component stream or the JSON for a determined reader to
 * dig out.
 */
export const applyGate = <T extends GateableDoc>(doc: T, verdict: GateVerdict): GatedDoc<T> => {
  if (verdict.allowed) return { doc, gate: verdict, teaserText: null }

  const teaserText = verdict.teaser === 'full-hide' ? null : buildTeaser(doc) || null

  const stripped = { ...doc } as Record<string, unknown>
  for (const field of BODY_FIELDS) {
    if (field in stripped) delete stripped[field]
  }
  // The excerpt fields are the teaser's source, so they are only kept when the
  // mode actually shows one.
  if (verdict.teaser === 'full-hide') {
    for (const field of ['excerpt', 'shortDescription', 'summary']) delete stripped[field]
  }

  return { doc: stripped as T, gate: verdict, teaserText }
}

/**
 * The one call a page needs: reads settings, evaluates, and returns the safe
 * copy. `settings` is injected so a caller that already read them does not read
 * them twice per render.
 */
export const gateDocument = async <T extends GateableDoc>(args: {
  engine: EngineQuery
  doc: T
  user: GateUser
  settings: MemberSettings
  now?: Date
}): Promise<GatedDoc<T>> => {
  const verdict = await evaluateGate(args)
  return applyGate(args.doc, verdict)
}
