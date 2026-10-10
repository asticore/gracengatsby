import { purgeCache } from '@/features/speed/purge'
import {
  loadApprovalSettings,
  requiredApprovalsFor,
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
import { notifyRequester, notifySubmitted } from './notify'

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

function actorFor(viewer: ReviewViewer, collection: string): ReviewActor {
  const perms = reviewPermissions(viewer, collection)
  return {
    id: viewer.id,
    name: viewer.name,
    isAdmin: viewer.isAdmin,
    can: { submit: perms.canSubmit, comment: perms.canComment, review: perms.canReview, publish: perms.canPublish },
  }
}

/** Which actions the viewer may take right now, worked out by asking the state machine. */
function allowedActions(args: {
  state: ReviewDocState
  actor: ReviewActor
  required: number
  allowSelfApproval: boolean
  adminsMaySelfApprove: boolean
  now: string
}): Record<'submit' | 'withdraw' | 'approve' | 'approveAndPublish' | 'requestChanges' | 'comment' | 'publish', boolean> {
  const base = {
    state: args.state,
    actor: args.actor,
    required: args.required,
    allowSelfApproval: args.allowSelfApproval,
    adminsMaySelfApprove: args.adminsMaySelfApprove,
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
    },
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

  const required = requiredApprovalsFor(settings, ref.collection)
  const actor = actorFor(args.viewer, ref.collection)
  const now = args.now ?? new Date().toISOString()
  const allowed = allowedActions({
    state: loaded.state,
    actor,
    required,
    allowSelfApproval: settings.allowSelfApproval,
    adminsMaySelfApprove: settings.adminsMaySelfApprove,
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
    requestedBy: loaded.state.requestedBy === null ? null : { id: loaded.state.requestedBy, name: requestedByName ?? UNKNOWN_USER },
    requestedAt: typeof loaded.doc.reviewRequestedAt === 'string' ? loaded.doc.reviewRequestedAt : null,
    approvals: loaded.state.approvals,
    publishBlocked: publishBlockMessage({ settings, collection: ref.collection, reviewStatus: loaded.state.status, isAdmin: args.viewer.isAdmin }),
    allowed: { ...allowed, comment: allowed.comment && settings.enabled },
    history: history.docs.map((event) => ({
      id: event.id,
      action: event.action,
      note: event.note ?? null,
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
  const required = requiredApprovalsFor(settings, ref.collection)
  const result = transition({
    state: loaded.state,
    action,
    actor: actorFor(args.viewer, ref.collection),
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
    JSON.stringify(next.approvals) !== JSON.stringify(loaded.state.approvals)

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
  const active = settings ?? (await loadApprovalSettings(engine))
  if (!active.enabled) return []
  const collections: ApprovalCollection[] = ['pages', 'posts', 'events', 'courses', 'products']
  const rows: ReviewQueueRow[] = []

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
    for (const doc of docs) {
      const id = Number(doc.id)
      const requester = doc.reviewRequestedBy as { name?: unknown } | number | null | undefined
      const requestedBy = requester && typeof requester === 'object' && typeof requester.name === 'string' && requester.name ? requester.name : UNKNOWN_USER
      rows.push({
        collection,
        id,
        title: titleOf(doc, id),
        requestedBy,
        requestedAt: typeof doc.reviewRequestedAt === 'string' ? doc.reviewRequestedAt : null,
        href: `/admin/collections/${collection}/${id}`,
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
