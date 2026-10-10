/**
 * The approval rules, read from the approval group on the Security settings global, and the one
 * question the rest of the system asks of them: may this document be published right now?
 *
 * Off by default. With the rules off, or a collection's requirement at 0, nothing here blocks
 * anything and the publish paths behave exactly as before.
 */

export const APPROVAL_COLLECTIONS = ['pages', 'posts', 'events', 'courses', 'products'] as const
export type ApprovalCollection = (typeof APPROVAL_COLLECTIONS)[number]

export type ApprovalSettings = {
  enabled: boolean
  /** 0 means that collection needs no review. 1-3 means that many approvals. */
  requiredApprovals: Record<ApprovalCollection, number>
  /** Anyone with review rights may approve their own change. */
  allowSelfApproval: boolean
  /**
   * Admins may approve their own change even when allowSelfApproval is off. On by default so a
   * solo admin can still publish; switch it off to require a second person for everyone.
   */
  adminsMaySelfApprove: boolean
  notifyReviewers: boolean
  /** Extra addresses that hear about every submission. */
  notifyEmails: string[]
  /**
   * True when the settings could not be read and no earlier good copy exists. Non-admins are
   * then blocked from publishing (fail closed); admins are not affected.
   */
  unknown?: boolean
}

export const MAX_REQUIRED_APPROVALS = 3

/** Shown to non-admins while the rules cannot be read. */
export const SETTINGS_UNAVAILABLE_MESSAGE = 'Approval settings could not be loaded; try again.'

export const DISABLED_APPROVAL_SETTINGS: ApprovalSettings = {
  enabled: false,
  requiredApprovals: { pages: 0, posts: 0, events: 0, courses: 0, products: 0 },
  allowSelfApproval: false,
  adminsMaySelfApprove: true,
  notifyReviewers: true,
  notifyEmails: [],
}

/** The last settings that were read successfully in this process. Used when a later read fails. */
let lastKnownGood: ApprovalSettings | null = null

/** The singular word used in messages to people: "This page needs approval...". */
export const APPROVAL_SINGULAR: Record<ApprovalCollection, string> = {
  pages: 'page',
  posts: 'post',
  events: 'event',
  courses: 'course',
  products: 'product',
}

export const isApprovalCollection = (value: unknown): value is ApprovalCollection =>
  typeof value === 'string' && (APPROVAL_COLLECTIONS as readonly string[]).includes(value)

const clampApprovals = (value: unknown): number => {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.min(MAX_REQUIRED_APPROVALS, number)
}

/** Turns the approval group of the Security global (or nothing at all) into settings. */
export function approvalSettingsFromGlobal(doc: unknown): ApprovalSettings {
  const group = (doc as { approval?: Record<string, unknown> } | null | undefined)?.approval
  if (!group || typeof group !== 'object') return DISABLED_APPROVAL_SETTINGS

  const emails = typeof group.notifyEmails === 'string' ? group.notifyEmails : ''
  return {
    enabled: group.enabled === true,
    requiredApprovals: {
      pages: clampApprovals(group.pagesApprovals),
      posts: clampApprovals(group.postsApprovals),
      events: clampApprovals(group.eventsApprovals),
      courses: clampApprovals(group.coursesApprovals),
      products: clampApprovals(group.productsApprovals),
    },
    allowSelfApproval: group.allowSelfApproval === true,
    adminsMaySelfApprove: group.adminsMaySelfApprove !== false,
    notifyReviewers: group.notifyReviewers !== false,
    notifyEmails: emails
      .split(/[\n,]/)
      .map((address) => address.trim())
      .filter((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)),
  }
}

/** Approvals a collection needs under these settings. Zero when the rules are off. */
export function requiredApprovalsFor(settings: ApprovalSettings, collection: string): number {
  if (!settings.enabled || !isApprovalCollection(collection)) return 0
  return settings.requiredApprovals[collection]
}

/** True when this collection needs review before anything can publish it. */
export function reviewRequired(settings: ApprovalSettings, collection: string): boolean {
  return requiredApprovalsFor(settings, collection) > 0
}

/**
 * The reason a document may not be published yet, or null when it may. Admins are never blocked.
 * The message is the one editors see.
 */
export function publishBlockMessage({
  settings,
  collection,
  reviewStatus,
  isAdmin,
}: {
  settings: ApprovalSettings
  collection: string
  reviewStatus: unknown
  isAdmin: boolean
}): string | null {
  if (isAdmin) return null
  if (settings.unknown) return SETTINGS_UNAVAILABLE_MESSAGE
  if (!reviewRequired(settings, collection)) return null
  if (reviewStatus === 'approved') return null
  const noun = isApprovalCollection(collection) ? APPROVAL_SINGULAR[collection] : 'document'
  return `This ${noun} needs approval before it can be published.`
}

/**
 * Reads the rules. A failed read falls back to the last settings read successfully in this
 * process. If there are none, the result is flagged `unknown`, which blocks non-admin publishing
 * (fail closed) rather than quietly switching review off.
 */
export async function loadApprovalSettings(engine: { findGlobal: (args: { slug: string; depth?: number; overrideAccess?: boolean }) => Promise<unknown> } | null | undefined): Promise<ApprovalSettings> {
  if (!engine) return DISABLED_APPROVAL_SETTINGS
  try {
    const doc = await engine.findGlobal({ slug: 'security-settings', depth: 0, overrideAccess: true })
    const settings = approvalSettingsFromGlobal(doc)
    lastKnownGood = settings
    return settings
  } catch (error) {
    console.error('approval settings could not be loaded', error)
    if (lastKnownGood) return lastKnownGood
    return { ...DISABLED_APPROVAL_SETTINGS, unknown: true }
  }
}

/** Test hook: forgets the last good copy so each test starts from nothing. */
export function resetApprovalSettingsCacheForTests(): void {
  lastKnownGood = null
}
