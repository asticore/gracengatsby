import { getAdminRoot } from '@/features/security/settings'
import { adminCollectionPath } from '@/admin/adminPaths'
import { can } from '@/features/roles/permissions'
import type { ApprovalCollection, ApprovalSettings } from './settings'
import { APPROVAL_SINGULAR } from './settings'
import { roleSlugsFor, type CustomRoleInfo } from './roleSlugs'
import { describeAwaiting, type ApprovalWorkflow } from './workflows'

/**
 * Review emails. The Email feature is imported when a message is sent, not at load time, because
 * it reaches for the engine (the same dodge the account emails use). sendEmail never throws, so a
 * mail problem never fails the review step that caused it.
 */

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type Sender = (args: { to: string; template?: string; subject: string; text: string }) => Promise<unknown>

/** Loaded once per notification, never per recipient: concurrent dynamic imports are not safe to rely on. */
const loadSender = async (): Promise<Sender> => {
  const { sendEmail } = await import('@/features/email')
  return sendEmail
}

/** Users are read this many at a time. */
const USER_PAGE_SIZE = 500
/** Never read more users than this when looking for reviewers. */
export const MAX_REVIEWER_SCAN = 5000

/** Custom roles by id, with their slug and permission matrix. A failed read gives none, and then custom-role reviewers are simply not emailed. */
async function loadCustomRoles(engine: EngineLike): Promise<Map<number, CustomRoleInfo>> {
  const roles = new Map<number, CustomRoleInfo>()
  try {
    const { docs } = await engine.find({ collection: 'roles', limit: 1000, depth: 0, overrideAccess: true })
    for (const role of docs ?? []) {
      const id = Number(role.id)
      if (!Number.isInteger(id) || typeof role.slug !== 'string') continue
      let permissions: unknown = role.permissions
      if (typeof permissions === 'string') {
        try {
          permissions = JSON.parse(permissions)
        } catch {
          permissions = undefined
        }
      }
      roles.set(id, { slug: role.slug, permissions: permissions && typeof permissions === 'object' ? (permissions as Record<string, unknown>) : undefined })
    }
  } catch {
    // no custom roles
  }
  return roles
}

/**
 * Everyone who can approve this collection, with an address, excluding the person who submitted.
 * Counts built-in roles, the custom role's own matrix and permission overrides, the same as the
 * admin does. With `stepRoles` (a workflow step) only people holding one of those roles are
 * included, plus admins. Pages through all users, up to MAX_REVIEWER_SCAN.
 */
export async function reviewerAddresses(
  engine: EngineLike,
  collection: ApprovalCollection,
  exceptUserId: number | null,
  stepRoles?: readonly string[] | null,
): Promise<string[]> {
  const addresses = new Set<string>()
  const customRoles = await loadCustomRoles(engine)
  let scanned = 0
  for (let page = 1; scanned < MAX_REVIEWER_SCAN; page++) {
    const result = await engine.find({ collection: 'users', limit: USER_PAGE_SIZE, page, depth: 0, overrideAccess: true })
    const docs = result.docs
    for (const user of docs) {
      const email = typeof user.email === 'string' ? user.email : ''
      if (!email || Number(user.id) === exceptUserId) continue
      const account = user as { roles?: string[]; customRole?: unknown; permissionOverrides?: unknown }
      const customId = Number(typeof account.customRole === 'object' && account.customRole ? (account.customRole as { id?: unknown }).id : account.customRole)
      const matrix = (customRoles.get(customId)?.permissions ?? undefined) as never
      const allowed = can(account as never, collection as never, 'publish', matrix) && can(account as never, 'review', 'publish', matrix)
      if (!allowed) continue
      if (stepRoles) {
        const isAdmin = Array.isArray(account.roles) && account.roles.includes('admin')
        const slugs = roleSlugsFor(account, customRoles)
        if (!isAdmin && !stepRoles.some((slug) => slugs.includes(slug))) continue
      }
      addresses.add(email)
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
  workflow,
}: {
  engine: EngineLike
  settings: ApprovalSettings
  collection: ApprovalCollection
  id: number
  title: string
  requesterName: string
  requesterId: number | null
  origin: string
  /** The active workflow: only the first step's approvers are emailed. */
  workflow?: ApprovalWorkflow | null
}): Promise<string[]> {
  const adminRoot = await getAdminRoot()
  const addresses = new Set<string>(settings.notifyEmails)
  if (settings.notifyReviewers) {
    for (const address of await reviewerAddresses(engine, collection, requesterId, workflow ? workflow.steps[0].approverRoles : null)) addresses.add(address)
  }
  const waiting = workflow ? `\n\n${describeAwaiting(workflow, 0)}` : ''
  const { renderEmailTemplate } = await import('@/features/email/templateLoad')
  const mail = await renderEmailTemplate('approvalSubmitted', {
    requesterName,
    noun: APPROVAL_SINGULAR[collection],
    title,
    waiting,
    link: `${origin}${adminCollectionPath(collection, adminRoot)}/${id}`,
  }, engine as never)
  const sendEmail = await loadSender()
  await Promise.all([...addresses].map((to) => sendEmail({ to, template: 'approval.submitted', subject: mail.subject, text: mail.text })))
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
  const adminRoot = await getAdminRoot()
  if (requesterId === null) return
  const user = await engine.findByID({ collection: 'users', id: requesterId, depth: 0, overrideAccess: true }).catch((): null => null)
  const email = typeof user?.email === 'string' ? user.email : ''
  if (!email) return

  const verb = outcome === 'approved' ? 'approved' : outcome === 'published' ? 'approved and published' : 'sent back with changes requested'
  const { renderEmailTemplate } = await import('@/features/email/templateLoad')
  const mail = await renderEmailTemplate('approvalDecision', {
    reviewerName,
    verb,
    noun: APPROVAL_SINGULAR[collection],
    title,
    note: note ? `\n\nTheir note:\n${note}` : '',
    link: `${origin}${adminCollectionPath(collection, adminRoot)}/${id}`,
  }, engine as never)
  const sendEmail = await loadSender()
  await sendEmail({ to: email, template: 'approval.decision', subject: mail.subject, text: mail.text })
}

/** A workflow step was approved and the document moved on: tell the approvers of the step now waiting. */
export async function notifyStepReady({
  engine,
  settings,
  collection,
  id,
  title,
  workflow,
  step,
  approverName,
  requesterId,
  origin,
}: {
  engine: EngineLike
  settings: ApprovalSettings
  collection: ApprovalCollection
  id: number
  title: string
  workflow: ApprovalWorkflow
  step: number
  approverName: string
  requesterId: number | null
  origin: string
}): Promise<string[]> {
  const adminRoot = await getAdminRoot()
  if (!settings.notifyReviewers) return []
  const current = workflow.steps[step]
  if (!current) return []
  const addresses = await reviewerAddresses(engine, collection, requesterId, current.approverRoles)
  const subject = `Your approval is needed: ${title}`
  const text = `${approverName} approved the previous step of this ${APPROVAL_SINGULAR[collection]}: ${title}\n\n${describeAwaiting(workflow, step)}\n\nOpen it to approve or ask for changes:\n${origin}${adminCollectionPath(collection, adminRoot)}/${id}`
  const sendEmail = await loadSender()
  await Promise.all(addresses.map((to) => sendEmail({ to, template: 'approval.step-ready', subject, text })))
  return addresses
}
