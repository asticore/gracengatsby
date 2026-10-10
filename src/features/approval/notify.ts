import { can } from '@/features/roles/permissions'
import type { ApprovalCollection, ApprovalSettings } from './settings'
import { APPROVAL_SINGULAR } from './settings'

/**
 * Review emails. The Email feature is imported when a message is sent, not at load time, because
 * it reaches for the engine (the same dodge the account emails use). sendEmail never throws, so a
 * mail problem never fails the review step that caused it.
 */

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type Sender = (args: { to: string; subject: string; text: string }) => Promise<unknown>

/** Loaded once per notification, never per recipient: concurrent dynamic imports are not safe to rely on. */
const loadSender = async (): Promise<Sender> => {
  const { sendEmail } = await import('@/features/email')
  return sendEmail
}

/** Users are read this many at a time. */
const USER_PAGE_SIZE = 500
/** Never read more users than this when looking for reviewers. */
export const MAX_REVIEWER_SCAN = 5000

/** Everyone who can approve this collection, with an address, excluding the person who submitted. Pages through all users, up to MAX_REVIEWER_SCAN. */
export async function reviewerAddresses(engine: EngineLike, collection: ApprovalCollection, exceptUserId: number | null): Promise<string[]> {
  const addresses = new Set<string>()
  let scanned = 0
  for (let page = 1; scanned < MAX_REVIEWER_SCAN; page++) {
    const result = await engine.find({ collection: 'users', limit: USER_PAGE_SIZE, page, depth: 0, overrideAccess: true })
    const docs = result.docs
    for (const user of docs) {
      const email = typeof user.email === 'string' ? user.email : ''
      if (!email || Number(user.id) === exceptUserId) continue
      const account = user as { roles?: string[]; permissionOverrides?: unknown }
      if (can(account as never, collection as never, 'publish') && can(account as never, 'review', 'publish')) {
        addresses.add(email)
      }
    }
    scanned += docs.length
    const hasMore = (result as { hasNextPage?: boolean }).hasNextPage ?? docs.length === USER_PAGE_SIZE
    if (!hasMore || docs.length === 0) break
  }
  return [...addresses]
}

export async function notifySubmitted({
  engine,
  settings,
  collection,
  id,
  title,
  requesterName,
  requesterId,
  origin,
}: {
  engine: EngineLike
  settings: ApprovalSettings
  collection: ApprovalCollection
  id: number
  title: string
  requesterName: string
  requesterId: number | null
  origin: string
}): Promise<string[]> {
  const addresses = new Set<string>(settings.notifyEmails)
  if (settings.notifyReviewers) {
    for (const address of await reviewerAddresses(engine, collection, requesterId)) addresses.add(address)
  }
  const noun = APPROVAL_SINGULAR[collection]
  const subject = `Review requested: ${title}`
  const text = `${requesterName} sent this ${noun} for review: ${title}\n\nOpen it to approve or ask for changes:\n${origin}/admin/collections/${collection}/${id}`
  const sendEmail = await loadSender()
  await Promise.all([...addresses].map((to) => sendEmail({ to, subject, text })))
  return [...addresses]
}

export async function notifyRequester({
  engine,
  requesterId,
  collection,
  id,
  title,
  outcome,
  reviewerName,
  note,
  origin,
}: {
  engine: EngineLike
  requesterId: number | null
  collection: ApprovalCollection
  id: number
  title: string
  outcome: 'approved' | 'changes_requested' | 'published'
  reviewerName: string
  note: string | null
  origin: string
}): Promise<void> {
  if (requesterId === null) return
  const user = await engine.findByID({ collection: 'users', id: requesterId, depth: 0, overrideAccess: true }).catch((): null => null)
  const email = typeof user?.email === 'string' ? user.email : ''
  if (!email) return

  const verb = outcome === 'approved' ? 'approved' : outcome === 'published' ? 'approved and published' : 'sent back with changes requested'
  const subject = `${title} was ${verb}`
  const lines = [`${reviewerName} ${verb} this ${APPROVAL_SINGULAR[collection]}: ${title}.`]
  if (note) lines.push(`Their note:\n${note}`)
  lines.push(`Open it here:\n${origin}/admin/collections/${collection}/${id}`)
  const sendEmail = await loadSender()
  await sendEmail({ to: email, subject, text: lines.join('\n\n') })
}
