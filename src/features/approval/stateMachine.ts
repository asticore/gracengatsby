/**
 * The review state machine. Pure: no database, no clock, no permissions lookup. The routes gather
 * the facts (who is acting, what they may do, the document's current state, the rule) and this
 * says what happens next, or why not.
 *
 *   none ---submit---> in_review
 *   changes_requested ---submit---> in_review
 *   in_review ---approve (enough approvals)---> approved
 *   in_review ---approve (not enough yet)---> in_review, one more approval recorded
 *   in_review ---request_changes (note needed)---> changes_requested
 *   in_review ---withdraw---> none
 *   approved ---publish---> none (published)        [approve + publish in one step also ends at none]
 *   any ---comment---> same state
 *   any edit to an approved document ---> in_review, approvals cleared (see resetOnEdit)
 *
 * With an active approval workflow (see workflows.ts) the count is replaced by steps. A document
 * in review sits at one step; only that step's approver roles (and admins) may approve or send it
 * back; reaching the step's approvals moves it to the next step with approvals cleared, and the
 * last step's approvals make it 'approved'. Sending it back, or editing its content, returns it
 * to step 0. Without a workflow `step` is never read.
 *
 * With a workflow, a non-admin who already approved an earlier step of the same review round may
 * not approve a later one (separation of duties). The route works out those people from the
 * history and passes them in as `priorApprovers`.
 */

import { clampStep, mayActOnStep, maySubmitUnder, type WorkflowRule } from './workflows'

export const REVIEW_STATUSES = ['none', 'in_review', 'changes_requested', 'approved'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const REVIEW_ACTIONS = ['submit', 'approve', 'request_changes', 'comment', 'withdraw', 'publish'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

/** Matches the `action` options of the review-events collection. */
export type ReviewEventAction = 'submitted' | 'approved' | 'changes_requested' | 'comment' | 'published' | 'withdrawn'

export type ReviewApproval = { userId: number; name: string; at: string }

export type ReviewDocState = {
  status: ReviewStatus
  /** The user who submitted the current review, or null when nothing is in review. */
  requestedBy: number | null
  /** Approvals given at the current step (all of them when there is no workflow). */
  approvals: ReviewApproval[]
  /** Zero-based workflow step awaiting approval. Absent means 0. */
  step?: number
}

/** What the acting user may do on this collection, worked out by the route. */
export type ReviewActor = {
  id: number
  name: string
  can: {
    /** Submit and withdraw own work: review.update plus update on the collection. */
    submit: boolean
    /** Read the history and add a comment. */
    comment: boolean
    /** Approve and request changes: publish on the collection plus review.publish. */
    review: boolean
    /** Publish an approved document: publish on the collection. */
    publish: boolean
  }
  /** Admins may approve their own work when they are the reviewer. */
  isAdmin: boolean
  /** Role slugs the user holds (built-in and custom), used only for workflow steps. Absent means none. */
  roleSlugs?: string[]
}

export type TransitionInput = {
  state: ReviewDocState
  action: ReviewAction
  actor: ReviewActor
  /** Approvals needed for this collection. Treated as at least 1 once review is in use. */
  required: number
  allowSelfApproval: boolean
  /**
   * Whether an admin may approve their own change when allowSelfApproval is off. Defaults to true
   * (the behaviour before this setting existed).
   */
  adminsMaySelfApprove?: boolean
  note?: string
  now: string
  /** Approve and publish in one step. Only honoured when the approval completes the review. */
  alsoPublish?: boolean
  /** The active workflow for this content type. When set it replaces `required`. */
  workflow?: WorkflowRule | null
  /**
   * Ids of people who approved an earlier step of this review round. Only checked with a workflow;
   * admins are exempt. Absent means none.
   */
  priorApprovers?: number[]
}

/** `step` is the workflow step name the event belongs to; present only when a workflow is active. */
export type TransitionEvent = { action: ReviewEventAction; note: string | null; step?: string | null }

export type TransitionOk = {
  ok: true
  state: ReviewDocState
  /** True when the document should be set to published by this transition. */
  publish: boolean
  events: TransitionEvent[]
  /** Set when an approval completed a step and the document moved on: the index of the step now awaited. */
  advancedTo?: number
}

export type TransitionFail = {
  ok: false
  /** HTTP status the route should answer with. */
  status: 400 | 403 | 409
  error: string
}

export type TransitionResult = TransitionOk | TransitionFail

export const MAX_NOTE_LENGTH = 2000

const fail = (status: TransitionFail['status'], error: string): TransitionFail => ({ ok: false, status, error })

const clean = (note: string | undefined): string | null => {
  const trimmed = (note ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Approvals needed, never less than one: a collection with review switched on needs someone to approve. */
export const effectiveRequired = (required: number): number => Math.max(1, Math.floor(required))

const stepOf = (state: ReviewDocState, workflow: WorkflowRule): number => clampStep(state.step, workflow.steps.length)

const emptyState = (): ReviewDocState => ({ status: 'none', requestedBy: null, approvals: [], step: 0 })

export function transition(input: TransitionInput): TransitionResult {
  const { state, action, actor, now } = input
  const note = clean(input.note)
  const workflow = input.workflow ?? null
  const needed = effectiveRequired(input.required)
  const roleSlugs = actor.roleSlugs ?? []

  /** The workflow step this document is at, with its name for history rows; null without a workflow. */
  const current = workflow ? workflow.steps[stepOf(state, workflow)] : null
  const withStep = (event: TransitionEvent, step = current): TransitionEvent => (step ? { ...event, step: step.name } : event)
  /** A reviewer may act only on the step the document is at. Without a workflow anyone with review rights may. */
  const stepBlock = (): TransitionFail | null => {
    if (!workflow || !current) return null
    if (mayActOnStep(current, roleSlugs, actor.isAdmin)) return null
    return fail(403, `This is waiting on ${describe(current.approverNames)} (step ${stepOf(state, workflow) + 1} of ${workflow.steps.length}: ${current.name}). Your role cannot approve this step.`)
  }
  const describe = (names: string[]): string => (names.length === 0 ? 'an admin' : names.join(' or '))

  switch (action) {
    case 'submit': {
      if (!actor.can.submit) return fail(403, 'Your role cannot submit content for review.')
      if (workflow && !maySubmitUnder(workflow, roleSlugs, actor.isAdmin)) {
        return fail(403, 'Your role cannot submit this content for review under the approval workflow.')
      }
      if (state.status !== 'none' && state.status !== 'changes_requested') {
        return fail(409, state.status === 'in_review' ? 'This is already in review.' : 'This is already approved.')
      }
      const first = workflow ? workflow.steps[0] : null
      return {
        ok: true,
        state: workflow
          ? { status: 'in_review', requestedBy: actor.id, approvals: [], step: 0 }
          : { status: 'in_review', requestedBy: actor.id, approvals: [] },
        publish: false,
        events: [withStep({ action: 'submitted', note }, first)],
      }
    }

    case 'withdraw': {
      if (state.status !== 'in_review') return fail(409, 'Only a document in review can be withdrawn.')
      const isRequester = state.requestedBy === actor.id && actor.can.submit
      if (!actor.can.review && !isRequester) return fail(403, 'Only the person who submitted this, or a reviewer, can withdraw it.')
      // A reviewer who is not the requester must be one of the step's approvers.
      if (!isRequester) {
        const blocked = stepBlock()
        if (blocked) return blocked
      }
      return {
        ok: true,
        state: workflow ? emptyState() : { status: 'none', requestedBy: null, approvals: [] },
        publish: false,
        events: [withStep({ action: 'withdrawn', note })],
      }
    }

    case 'approve': {
      if (!actor.can.review) return fail(403, 'Your role cannot approve content.')
      if (state.status !== 'in_review') return fail(409, 'Only a document in review can be approved.')
      const blocked = stepBlock()
      if (blocked) return blocked
      const adminMaySelf = actor.isAdmin && (input.adminsMaySelfApprove ?? true)
      if (state.requestedBy === actor.id && !(input.allowSelfApproval || adminMaySelf)) {
        return fail(403, 'You cannot approve your own change.')
      }
      if (state.approvals.some((approval) => approval.userId === actor.id)) {
        return fail(409, 'You have already approved this.')
      }
      if (workflow && !actor.isAdmin && (input.priorApprovers ?? []).includes(actor.id)) {
        return fail(403, 'You already approved an earlier step.')
      }
      const approvals = [...state.approvals, { userId: actor.id, name: actor.name, at: now }]
      const events: TransitionEvent[] = [withStep({ action: 'approved', note })]
      const stepNeeded = workflow && current ? current.approvalsNeeded : needed
      const index = workflow ? stepOf(state, workflow) : 0
      const keep = (extra: Partial<ReviewDocState>): ReviewDocState => ({ status: 'in_review', requestedBy: state.requestedBy, approvals, ...(workflow ? { step: index } : {}), ...extra })

      if (approvals.length < stepNeeded) {
        return { ok: true, state: keep({}), publish: false, events }
      }

      // The step is complete. Another step follows: move on with approvals cleared.
      if (workflow && index < workflow.steps.length - 1) {
        return { ok: true, state: keep({ approvals: [], step: index + 1 }), publish: false, events, advancedTo: index + 1 }
      }

      if (input.alsoPublish) {
        if (!actor.can.publish) return fail(403, 'Your role cannot publish this content.')
        events.push({ action: 'published', note: null })
        return { ok: true, state: workflow ? emptyState() : { status: 'none', requestedBy: null, approvals: [] }, publish: true, events }
      }
      return { ok: true, state: keep({ status: 'approved' }), publish: false, events }
    }

    case 'request_changes': {
      if (!actor.can.review) return fail(403, 'Your role cannot ask for changes.')
      if (state.status !== 'in_review') return fail(409, 'Only a document in review can be sent back.')
      const blocked = stepBlock()
      if (blocked) return blocked
      if (!note) return fail(400, 'Say what needs to change.')
      return {
        ok: true,
        state: { status: 'changes_requested', requestedBy: state.requestedBy, approvals: [], ...(workflow ? { step: 0 } : {}) },
        publish: false,
        events: [withStep({ action: 'changes_requested', note })],
      }
    }

    case 'comment': {
      if (!actor.can.comment) return fail(403, 'Your role cannot comment on content.')
      if (!note) return fail(400, 'Write a comment first.')
      return { ok: true, state, publish: false, events: [withStep({ action: 'comment', note })] }
    }

    case 'publish': {
      if (!actor.can.publish) return fail(403, 'Your role cannot publish this content.')
      if (state.status !== 'approved') return fail(409, 'Only an approved document can be published from review.')
      return {
        ok: true,
        state: workflow ? emptyState() : { status: 'none', requestedBy: null, approvals: [] },
        publish: true,
        events: [{ action: 'published', note: null }],
      }
    }
  }
}

/**
 * The rule for an edit that is not a review action. Changing an approved document takes it back
 * to review and clears its approvals, because the approval was for the old content. Changing the
 * content of a document that is in review also clears its approvals, but it stays in review.
 */
export function resetOnEdit(state: ReviewDocState, contentChanged = false): ReviewDocState {
  // The approvals were for the old content, so a workflow starts again from its first step.
  const restart: Partial<ReviewDocState> = state.step === undefined ? {} : { step: 0 }
  if (state.status === 'approved') return { status: 'in_review', requestedBy: state.requestedBy, approvals: [], ...restart }
  if (state.status === 'in_review' && contentChanged) return { status: 'in_review', requestedBy: state.requestedBy, approvals: [], ...restart }
  return state
}

/**
 * What the reviewApprovals column holds. Written as `{ hash, approvals }`, where `hash` is the
 * content hash the approvals were given against. Rows written before that were a bare array of
 * approvals with no hash; those still read correctly, with `hash: null`.
 */
export type StoredReview = { hash: string | null; approvals: ReviewApproval[] }

export function parseStoredReview(value: unknown): StoredReview {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return { hash: null, approvals: [] }
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>
    return {
      hash: typeof record.hash === 'string' ? record.hash : null,
      approvals: parseApprovalList(record.approvals),
    }
  }
  return { hash: null, approvals: parseApprovalList(raw) }
}

export function serializeStoredReview(review: StoredReview): StoredReview | ReviewApproval[] {
  return review.hash === null ? review.approvals : { hash: review.hash, approvals: review.approvals }
}

/** Parses the stored approvals defensively, in either shape; anything malformed is dropped. */
export function parseApprovals(value: unknown): ReviewApproval[] {
  return parseStoredReview(value).approvals
}

function parseApprovalList(value: unknown): ReviewApproval[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): ReviewApproval[] => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const userId = Number(row.userId)
    if (!Number.isInteger(userId) || userId <= 0) return []
    return [{ userId, name: typeof row.name === 'string' ? row.name : '', at: typeof row.at === 'string' ? row.at : '' }]
  })
}

/** The fields that make up the content under review. A change to any of them is a change to what was approved. */
export const REVIEWED_CONTENT_FIELDS = ['title', 'slug', 'blocks', 'layout', 'content', 'seo', 'customFields'] as const

/** JSON with object keys sorted at every level, so the same content always produces the same text. */
function stableStringify(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/** cyrb53: a small, fast, non-cryptographic string hash. Used only to notice that content changed. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** A stable hash of the reviewed content fields of one document. Missing fields count as empty. */
export function hashReviewedContent(doc: Record<string, unknown>): string {
  const picked: Record<string, unknown> = {}
  for (const key of REVIEWED_CONTENT_FIELDS) picked[key] = doc[key] ?? null
  return cyrb53(stableStringify(picked))
}

/** Normalises a stored status to one of the four known values. Anything else reads as 'none'. */
export function parseStatus(value: unknown): ReviewStatus {
  return REVIEW_STATUSES.find((status) => status === value) ?? 'none'
}
