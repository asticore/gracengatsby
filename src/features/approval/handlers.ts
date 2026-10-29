import { getAdminRoot } from '@/features/security/settings'
import { adminCollectionPath } from '@/admin/adminPaths'
import { purgeCache } from '@/features/speed/purge'
import {
  loadApprovalSettings,
  requiredApprovalsFor,
  activeWorkflowFor,
  publishBlockMessage,
  isApprovalCollection,
  SETTINGS_UNAVAILABLE_MESSAGE,
  type ApprovalCollection,
  type ApprovalSettings,
} from './settings'
import {
  MAX_NOTE_LENGTH,
  hashReviewedContent,
  parseApprovals,
  parseStatus,
  serializeStoredReview,
  transition,
  type ReviewAction,
  type ReviewDocState,
  type ReviewEventAction,
  type ReviewActor,
} from './stateMachine'
import { reviewPermissions, type ReviewViewer } from './permissions'
import { notifyRequester, notifyStepReady, notifySubmitted } from './notify'
import { clampStep, describeAwaiting, type ApprovalWorkflow } from './workflows'
import { roleSlugsOfUser } from './roleSlugs'

/**
 * The approval routes' logic, separated from Next.js so it can be tested with a fake engine. The
 * route files only read the admin context, build a viewer from it, and pass the request in.
 */

/** The slice of the engine these handlers use. The real engine satisfies it. */
export type ReviewEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  update: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<unknown>
  findGlobal: (args: Record<string, unknown>) => Promise<unknown>
}

export type HandlerResult = { status: number; body: Record<string, unknown> }

const json = (status: number, body: Record<string, unknown>): HandlerResult => ({ status, body })

const relationId = (value: unknown): number | null => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

const titleOf = (doc: Record<string, unknown>, id: number): string => {
  if (typeof doc.title === 'string' && doc.title.trim()) return doc.title
  if (typeof doc.name === 'string' && doc.name.trim()) return doc.name
  return `#${id}`
}

/** Shown wherever a person's name is not known. Email addresses are never returned to the browser. */
export const UNKNOWN_USER = 'Unknown user'

/** The display name of a user, or null. Never the email address: this reaches the browser. */
const userName = async (engine: ReviewEngine, id: number | null): Promise<string | null> => {
  if (id === null) return null
  const user = await engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true }).catch((): null => null)
  if (!user) return null
  if (typeof user.name === 'string' && user.name.trim()) return user.name
  return null
}

export const parseDocRef = (collection: unknown, id: unknown): { collection: ApprovalCollection; id: number } | null => {
  const numericId = typeof id === 'string' && id.trim() !== '' ? Number(id) : id
  if (!isApprovalCollection(collection)) return null
  if (typeof numericId !== 'number' || !Number.isInteger(numericId) || numericId <= 0) return null
  return { collection, id: numericId }
}

function actorFor(viewer: ReviewViewer, collection: string, roleSlugs: string[] = []): ReviewActor {
  const perms = reviewPermissions(viewer, collection)
  return {
    id: viewer.id,
    name: viewer.name,
    isAdmin: viewer.isAdmin,
    can: { submit: perms.canSubmit, comment: perms.canComment, review: perms.canReview, publish: perms.canPublish },
    roleSlugs,
  }
}

/** The viewer's role slugs, read only when a workflow needs them. Admins need none; a failed read means no roles (fail closed). */
async function viewerRoleSlugs(engine: ReviewEngine, viewer: ReviewViewer, workflow: ApprovalWorkflow | null): Promise<string[]> {
  if (!workflow || viewer.isAdmin) return viewer.isAdmin ? ['admin'] : []
  return roleSlugsOfUser(engine, viewer.id)
}

/**
 * Ids of the people who approved an earlier step of the current review round. The history rows since
 * the last submit hold this, so no column is needed. Empty without a workflow or at the first step.
 */
async function priorApproversThisRound(
  engine: ReviewEngine,
  collection: string,
  id: number,
  workflow: ApprovalWorkflow | null,
  index: number,
): Promise<number[]> {
  if (!workflow || index === 0) return []
  const current = workflow.steps[index].name
  const earlier = new Set(workflow.steps.slice(0, index).map((step) => step.name).filter((name) => name !== current))
  if (earlier.size === 0) return []
  const { docs } = await engine.find({
    collection: 'review-events',
    where: {
      and: [
        { collection: { equals: collection } },
        { docId: { equals: id } },
        { action: { in: ['submitted', 'approved'] } },
      ],
    },
    sort: '-createdAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const ids: number[] = []
  for (const event of docs) {
    if (event.action === 'submitted') break
    const approverId = relationId(event.actor)
    if (event.action === 'approved' && approverId !== null && typeof event.step === 'string' && earlier.has(event.step)) {
      ids.push(approverId)
    }
  }
  return ids
}

/** Which actions the viewer may take right now, worked out by asking the state machine. */
function allowedActions(args: {
  state: ReviewDocState
  actor: ReviewActor
  required: number
  allowSelfApproval: boolean
  adminsMaySelfApprove: boolean
  workflow?: ApprovalWorkflow | null
  priorApprovers?: number[]
  now: string
}): Record<'submit' | 'withdraw' | 'approve' | 'approveAndPublish' | 'requestChanges' | 'comment' | 'publish', boolean> {
  const base = {
    state: args.state,
    actor: args.actor,
    required: args.required,
    allowSelfApproval: args.allowSelfApproval,
    adminsMaySelfApprove: args.adminsMaySelfApprove,
    workflow: args.workflow ?? null,
    priorApprovers: args.priorApprovers ?? [],
    now: args.now,
  }
  const ok = (input: Parameters<typeof transition>[0]) => transition(input).ok
  return {
    submit: ok({ ...base, action: 'submit' }),
    withdraw: ok({ ...base, action: 'withdraw' }),
    approve: ok({ ...base, action: 'approve' }),
    approveAndPublish: (() => {
      const result = transition({ ...base, action: 'approve', alsoPublish: true })
      return result.ok && result.publish
    })(),
    requestChanges: ok({ ...base, action: 'request_changes', note: 'x' }),
    comment: ok({ ...base, action: 'comment', note: 'x' }),
    publish: ok({ ...base, action: 'publish' }),
  }
}

async function loadState(engine: ReviewEngine, collection: string, id: number): Promise<{ doc: Record<string, unknown>; state: ReviewDocState } | null> {
  const doc = await engine.findByID({ collection, id, depth: 0, overrideAccess: true })
  if (!doc) return null
  return {
    doc,
    state: {
      status: parseStatus(doc.reviewStatus),
      requestedBy: relationId(doc.reviewRequestedBy),
      approvals: parseApprovals(doc.reviewApprovals),
      step: Math.max(0, Math.floor(Number(doc.reviewStep)) || 0),
    },
  }
}

/** The workflow part of a GET: which flow, which step is awaited and who is waited on. */
function workflowInfo(workflow: ApprovalWorkflow | null, state: ReviewDocState): Record<string, unknown> | null {
  if (!workflow) return null
  const index = clampStep(state.step, workflow.steps.length)
  const current = workflow.steps[index]
  const waiting = state.status === 'in_review'
  return {
    id: workflow.id,
    name: workflow.name,
    stepCount: workflow.steps.length,
    step: waiting
      ? { index, name: current.name, approverRoles: current.approverNames, approvalsNeeded: current.approvalsNeeded, total: workflow.steps.length }
      : null,
    awaiting: waiting ? describeAwaiting(workflow, index) : null,
  }
}

/** GET: the review state, what the viewer may do, the publish block and the history of one document. */
export async function handleReviewGet(args: {
  engine: ReviewEngine
  viewer: ReviewViewer
  collection: unknown
  id: unknown
  now?: string
}): Promise<HandlerResult> {
  const ref = parseDocRef(args.collection, args.id)
  if (!ref) return json(400, { error: 'Invalid collection or id' })

  const perms = reviewPermissions(args.viewer, ref.collection)
  if (!perms.canReadReview || !perms.canReadDocument) return json(403, { error: 'Forbidden' })

  const settings = await loadApprovalSettings(args.engine)
  const loaded = await loadState(args.engine, ref.collection, ref.id)
  if (!loaded) return json(404, { error: 'Not found' })

  const workflow = activeWorkflowFor(settings, ref.collection)
  const required = workflow ? workflow.steps[clampStep(loaded.state.step, workflow.steps.length)].approvalsNeeded : requiredApprovalsFor(settings, ref.collection)
  const actor = actorFor(args.viewer, ref.collection, await viewerRoleSlugs(args.engine, args.viewer, workflow))
  const now = args.now ?? new Date().toISOString()
  const priorApprovers = await priorApproversThisRound(args.engine, ref.collection, ref.id, workflow, clampStep(loaded.state.step, workflow?.steps.length ?? 1))
  const allowed = allowedActions({
    state: loaded.state,
    actor,
    required,
    allowSelfApproval: settings.allowSelfApproval,
    adminsMaySelfApprove: settings.adminsMaySelfApprove,
    workflow,
    priorApprovers,
    now,
  })

  const history = await args.engine.find({
    collection: 'review-events',
    where: { and: [{ collection: { equals: ref.collection } }, { docId: { equals: ref.id } }] },
    sort: '-createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  const requestedByName = await userName(args.engine, loaded.state.requestedBy)

  return json(200, {
    enabled: settings.enabled,
    collection: ref.collection,
    id: ref.id,
    status: loaded.state.status,
    requiredApprovals: required,
    workflow: workflowInfo(workflow, loaded.state),
    requestedBy: loaded.state.requestedBy === null ? null : { id: loaded.state.requestedBy, name: requestedByName ?? UNKNOWN_USER },
    requestedAt: typeof loaded.doc.reviewRequestedAt === 'string' ? loaded.doc.reviewRequestedAt : null,
    approvals: loaded.state.approvals,
    publishBlocked: publishBlockMessage({ settings, collection: ref.collection, reviewStatus: loaded.state.status, reviewStep: loaded.state.step, isAdmin: args.viewer.isAdmin }),
    allowed: { ...allowed, comment: allowed.comment && settings.enabled },
    history: history.docs.map((event) => ({
      id: event.id,
      action: event.action,
      note: event.note ?? null,
      ...(typeof event.step === 'string' && event.step ? { step: event.step } : {}),
      actorName: event.actorName ?? null,
      createdAt: event.createdAt ?? null,
    })),
  })
}

/** POST: one review step. Writes the document's review fields, one history row per step, and any emails. */
export async function handleReviewPost(args: {
  engine: ReviewEngine
  viewer: ReviewViewer
  origin: string
  body: unknown
  now?: string
}): Promise<HandlerResult> {
  if (!args.body || typeof args.body !== 'object') return json(400, { error: 'Invalid request body' })
  const body = args.body as Record<string, unknown>

  const ref = parseDocRef(body.collection, body.id)
  if (!ref) return json(400, { error: 'Invalid collection or id' })

  const action = body.action as ReviewAction
  if (!['submit', 'approve', 'request_changes', 'comment', 'withdraw', 'publish'].includes(String(action))) {
    return json(400, { error: 'Invalid action' })
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return json(400, { error: 'Note must be text' })
  const note = typeof body.note === 'string' ? body.note : undefined
  if (note && note.length > MAX_NOTE_LENGTH) return json(400, { error: `Keep notes under ${MAX_NOTE_LENGTH} characters` })

  const perms = reviewPermissions(args.viewer, ref.collection)
  if (!perms.canReadDocument) return json(403, { error: 'Forbidden' })

  const settings = await loadApprovalSettings(args.engine)
  // Fail closed: with the rules unreadable, a review step is refused rather than guessed at.
  if (settings.unknown) return json(503, { error: SETTINGS_UNAVAILABLE_MESSAGE })
  if (!settings.enabled) return json(409, { error: 'Content approval is turned off.' })

  const loaded = await loadState(args.engine, ref.collection, ref.id)
  if (!loaded) return json(404, { error: 'Not found' })

  // A live document is changed by switching it to draft first; review only applies to drafts.
  if (action === 'submit' && loaded.doc._status === 'published') {
    return json(409, { error: 'Switch this to draft before sending changes for review.' })
  }

  const now = args.now ?? new Date().toISOString()
  const workflow = activeWorkflowFor(settings, ref.collection)
  const required = workflow ? workflow.steps[clampStep(loaded.state.step, workflow.steps.length)].approvalsNeeded : requiredApprovalsFor(settings, ref.collection)
  const priorApprovers = action === 'approve' ? await priorApproversThisRound(args.engine, ref.collection, ref.id, workflow, clampStep(loaded.state.step, workflow?.steps.length ?? 1)) : []
  const result = transition({
    state: loaded.state,
    action,
    actor: actorFor(args.viewer, ref.collection, await viewerRoleSlugs(args.engine, args.viewer, workflow)),
    workflow,
    priorApprovers,
    required,
    allowSelfApproval: settings.allowSelfApproval,
    adminsMaySelfApprove: settings.adminsMaySelfApprove,
    note,
    now,
    alsoPublish: body.alsoPublish === true,
  })
  if (result.ok === false) return json(result.status, { error: result.error })

  const next = result.state
  const title = titleOf(loaded.doc, ref.id)
  const stateChanged =
    next.status !== loaded.state.status ||
    next.requestedBy !== loaded.state.requestedBy ||
    JSON.stringify(next.approvals) !== JSON.stringify(loaded.state.approvals) ||
    (workflow !== null && (next.step ?? 0) !== (loaded.state.step ?? 0))

  if (result.publish || stateChanged) {
    // Optimistic concurrency: re-read the review fields and the timestamp right before the write.
    // If anyone changed the document since this request loaded it, refuse rather than overwrite.
    const fresh = await loadState(args.engine, ref.collection, ref.id)
    if (!fresh) return json(404, { error: 'Not found' })
    if (fresh.state.status !== loaded.state.status || fresh.doc.updatedAt !== loaded.doc.updatedAt) {
      return json(409, { error: 'This changed while you were working on it. Reload and try again.' })
    }

    const data: Record<string, unknown> = {
      reviewStatus: next.status,
      reviewRequestedBy: next.requestedBy,
      reviewRequestedAt: action === 'submit' ? now : next.requestedBy === null ? null : (loaded.doc.reviewRequestedAt ?? null),
      // The approvals are tied to the content as it is now, so a later edit can be detected.
      reviewApprovals: serializeStoredReview({ hash: hashReviewedContent(loaded.doc), approvals: next.approvals }),
    }
    if (workflow) data.reviewStep = next.step ?? 0
    else if (loaded.state.step) data.reviewStep = 0
    if (result.publish) data._status = 'published'
    await args.engine.update({ collection: ref.collection, id: ref.id, data, overrideAccess: true })
  }

  for (const event of result.events) {
    await args.engine.create({
      collection: 'review-events',
      data: {
        collection: ref.collection,
        docId: ref.id,
        docTitle: title,
        action: event.action,
        note: event.note,
        ...(event.step ? { step: event.step } : {}),
        actor: args.viewer.id,
        actorName: args.viewer.name,
      },
      overrideAccess: true,
    })
  }

  // Emails. Failures are swallowed inside the notifier.
  if (action === 'submit') {
    await notifySubmitted({
      engine: args.engine,
      settings,
      collection: ref.collection,
      id: ref.id,
      title,
      requesterName: args.viewer.name,
      requesterId: args.viewer.id,
      origin: args.origin,
      workflow,
    })
  }
  if (action === 'approve' && workflow && result.advancedTo !== undefined) {
    await notifyStepReady({
      engine: args.engine,
      settings,
      collection: ref.collection,
      id: ref.id,
      title,
      workflow,
      step: result.advancedTo,
      approverName: args.viewer.name,
      requesterId: loaded.state.requestedBy,
      origin: args.origin,
    })
  }
  const requesterId = loaded.state.requestedBy
  const reviewerName = args.viewer.name
  if (action === 'approve' && result.publish) {
    await notifyRequester({ engine: args.engine, requesterId, collection: ref.collection, id: ref.id, title, outcome: 'published', reviewerName, note: null, origin: args.origin })
  } else if (action === 'approve' && next.status === 'approved') {
    await notifyRequester({ engine: args.engine, requesterId, collection: ref.collection, id: ref.id, title, outcome: 'approved', reviewerName, note: note ?? null, origin: args.origin })
  } else if (action === 'request_changes') {
    await notifyRequester({ engine: args.engine, requesterId, collection: ref.collection, id: ref.id, title, outcome: 'changes_requested', reviewerName, note: note ?? null, origin: args.origin })
  }

  if (result.publish && ref.collection === 'pages') {
    await purgeCache(`/pages/${ref.id}`).catch((): null => null)
  }

  return json(200, {
    ok: true,
    status: next.status,
    approvals: next.approvals,
    requiredApprovals: required,
    ...(workflow && next.status === 'in_review' ? { step: next.step ?? 0, awaiting: describeAwaiting(workflow, next.step ?? 0) } : {}),
    published: result.publish,
    events: result.events.map((event: { action: ReviewEventAction }) => event.action),
  })
}

export type ReviewQueueRow = {
  collection: ApprovalCollection
  id: number
  title: string
  requestedBy: string
  requestedAt: string | null
  href: string
  /** Workflow step the document waits at ("Step 2 of 3: Legal review"), when a workflow is active. */
  awaiting?: string
}

/**
 * Documents waiting for review that this viewer can act on: everything in the collections they
 * may review, and for the others, only what they submitted themselves.
 */
export async function loadReviewQueue({
  engine,
  viewer,
  settings,
  limit = 50,
}: {
  engine: ReviewEngine
  viewer: ReviewViewer
  settings?: ApprovalSettings
  limit?: number
}): Promise<ReviewQueueRow[]> {
  const adminRoot = await getAdminRoot()
  const active = settings ?? (await loadApprovalSettings(engine))
  if (!active.enabled) return []
  const collections: ApprovalCollection[] = ['pages', 'posts', 'events', 'courses', 'products']
  const rows: ReviewQueueRow[] = []
  let roleSlugs: string[] | null = null

  for (const collection of collections) {
    const perms = reviewPermissions(viewer, collection)
    if (!perms.canReadReview || !perms.canReadDocument) continue
    if (!perms.canReview && !perms.canSubmit) continue

    const where = perms.canReview
      ? { reviewStatus: { equals: 'in_review' } }
      : { and: [{ reviewStatus: { equals: 'in_review' } }, { reviewRequestedBy: { equals: viewer.id } }] }

    const { docs } = await engine.find({
      collection,
      where,
      sort: '-reviewRequestedAt',
      limit,
      depth: 1,
      overrideAccess: true,
    })
    const workflow = activeWorkflowFor(active, collection)
    if (workflow && !viewer.isAdmin && roleSlugs === null) roleSlugs = await roleSlugsOfUser(engine, viewer.id)
    for (const doc of docs) {
      const id = Number(doc.id)
      let awaiting: string | undefined
      if (workflow) {
        const index = clampStep(doc.reviewStep, workflow.steps.length)
        const step = workflow.steps[index]
        awaiting = `Step ${index + 1} of ${workflow.steps.length}: ${step.name}`
        // Reviewers see what waits on their step; the people who submitted a document still see it.
        const ownSubmission = relationId(doc.reviewRequestedBy) === viewer.id
        const mayAct = viewer.isAdmin || step.approverRoles.some((slug) => (roleSlugs ?? []).includes(slug))
        if (!mayAct && !ownSubmission) continue
      }
      const requester = doc.reviewRequestedBy as { name?: unknown } | number | null | undefined
      const requestedBy = requester && typeof requester === 'object' && typeof requester.name === 'string' && requester.name ? requester.name : UNKNOWN_USER
      rows.push({
        collection,
        id,
        title: titleOf(doc, id),
        requestedBy,
        requestedAt: typeof doc.reviewRequestedAt === 'string' ? doc.reviewRequestedAt : null,
        href: `${adminCollectionPath(collection, adminRoot)}/${id}`,
        ...(awaiting ? { awaiting } : {}),
      })
    }
  }

  return rows
    .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''))
    .slice(0, limit)
}

/** GET queue route body. */
export async function handleReviewQueue(args: { engine: ReviewEngine; viewer: ReviewViewer }): Promise<HandlerResult> {
  const settings = await loadApprovalSettings(args.engine)
  const rows = await loadReviewQueue({ engine: args.engine, viewer: args.viewer, settings })
  return json(200, { enabled: settings.enabled, rows })
}
