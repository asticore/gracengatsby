// @vitest-environment node
/**
 * Content approval: the state machine, the rules, the publish guard, scheduled publishing, the
 * permission matrix and the review handlers. The engine is a small fake here; the real schema
 * and migrations are covered by content-approval-fresh-install.int.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as unknown))
const markDone = vi.hoisted(() => vi.fn(async () => undefined))
const listDue = vi.hoisted(() => vi.fn(async () => [] as Array<{ collection: string; docId: number; action: 'publish' | 'unpublish' }>))

vi.mock('@/features/email', () => ({ sendEmail }))
vi.mock('@/features/speed/purge', () => ({ purgeCache: vi.fn(async () => ({})) }))
vi.mock('@/cms/db/scheduledPublishes', () => ({ markDone, listDue }))

import { ReviewEvents } from '@/features/approval/collection'
import { handleReviewGet, handleReviewPost, loadReviewQueue } from '@/features/approval/handlers'
import {
  approvalSettingsFromGlobal,
  DISABLED_APPROVAL_SETTINGS,
  publishBlockMessage,
  requiredApprovalsFor,
  type ApprovalSettings,
} from '@/features/approval/settings'
import { parseApprovals, resetOnEdit, transition, type ReviewActor, type ReviewDocState } from '@/features/approval/stateMachine'
import { publishGuard } from '@/features/roles/contentEditGuard'
import { BUILT_IN_ROLES, can, PERMISSION_CATEGORIES, RESOURCES } from '@/features/roles/permissions'
import { runDueSchedules } from '@/features/schedule/runDue'
import type { ReviewViewer } from '@/features/approval/permissions'
import { hashReviewedContent, parseStoredReview, serializeStoredReview } from '@/features/approval/stateMachine'
import { MAX_REVIEWER_SCAN, reviewerAddresses } from '@/features/approval/notify'
import { loadApprovalSettings, resetApprovalSettingsCacheForTests, SETTINGS_UNAVAILABLE_MESSAGE } from '@/features/approval/settings'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { up as up20261011 } from '@/migrations/20261011_130000_content_approval'

const NOW = '2026-10-10T10:00:00.000Z'

const actor = (overrides: Partial<ReviewActor> & { id: number }): ReviewActor => ({
  name: `User ${overrides.id}`,
  isAdmin: false,
  can: { submit: true, comment: true, review: false, publish: false },
  ...overrides,
})

const reviewer = (id: number): ReviewActor => actor({ id, can: { submit: true, comment: true, review: true, publish: true } })
const author = (id: number): ReviewActor => actor({ id })

const inReview = (requestedBy: number, approvals: ReviewDocState['approvals'] = []): ReviewDocState => ({
  status: 'in_review',
  requestedBy,
  approvals,
})

const ON: ApprovalSettings = {
  ...DISABLED_APPROVAL_SETTINGS,
  enabled: true,
  requiredApprovals: { pages: 1, posts: 2, events: 0, courses: 0, products: 0 },
}

describe('state machine', () => {
  it('submit moves none to in_review and records the author', () => {
    const result = transition({ state: { status: 'none', requestedBy: null, approvals: [] }, action: 'submit', actor: author(3), required: 1, allowSelfApproval: false, now: NOW })
    expect(result).toMatchObject({ ok: true, state: { status: 'in_review', requestedBy: 3, approvals: [] }, publish: false })
    expect(result.ok && result.events).toEqual([{ action: 'submitted', note: null }])
  })

  it('submit is refused while already in review, and when already approved', () => {
    const again = transition({ state: inReview(3), action: 'submit', actor: author(3), required: 1, allowSelfApproval: false, now: NOW })
    expect(again).toMatchObject({ ok: false, status: 409 })
    const approved = transition({ state: { status: 'approved', requestedBy: 3, approvals: [] }, action: 'submit', actor: author(3), required: 1, allowSelfApproval: false, now: NOW })
    expect(approved).toMatchObject({ ok: false, status: 409 })
  })

  it('an editor without review rights cannot approve', () => {
    const result = transition({ state: inReview(3), action: 'approve', actor: author(4), required: 1, allowSelfApproval: false, now: NOW })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('one approval completes a single-approval review', () => {
    const result = transition({ state: inReview(3), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: false, now: NOW })
    expect(result).toMatchObject({ ok: true, publish: false, state: { status: 'approved', requestedBy: 3 } })
  })

  it('two approvals are needed when two are required, and one reviewer cannot give both', () => {
    const first = transition({ state: inReview(3), action: 'approve', actor: reviewer(9), required: 2, allowSelfApproval: false, now: NOW })
    expect(first.ok && first.state).toMatchObject({ status: 'in_review' })
    if (!first.ok) throw new Error('first approval should succeed')
    expect(first.state.approvals).toHaveLength(1)

    const second = transition({ state: first.state, action: 'approve', actor: reviewer(10), required: 2, allowSelfApproval: false, now: NOW })
    expect(second).toMatchObject({ ok: true, state: { status: 'approved' } })

    const twice = transition({ state: first.state, action: 'approve', actor: reviewer(9), required: 2, allowSelfApproval: false, now: NOW })
    expect(twice).toMatchObject({ ok: false, status: 409 })
  })

  it('self-approval is refused unless allowed or the reviewer is an admin', () => {
    const self = transition({ state: inReview(9), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: false, now: NOW })
    expect(self).toMatchObject({ ok: false, status: 403 })

    const allowed = transition({ state: inReview(9), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: true, now: NOW })
    expect(allowed).toMatchObject({ ok: true, state: { status: 'approved' } })

    const admin = transition({
      state: inReview(9),
      action: 'approve',
      actor: { ...reviewer(9), isAdmin: true },
      required: 1,
      allowSelfApproval: false,
      now: NOW,
    })
    expect(admin).toMatchObject({ ok: true, state: { status: 'approved' } })
  })

  it('request changes needs a note and sends the document back', () => {
    const blank = transition({ state: inReview(3), action: 'request_changes', actor: reviewer(9), required: 1, allowSelfApproval: false, note: '   ', now: NOW })
    expect(blank).toMatchObject({ ok: false, status: 400 })

    const sent = transition({ state: inReview(3), action: 'request_changes', actor: reviewer(9), required: 1, allowSelfApproval: false, note: 'Fix the date', now: NOW })
    expect(sent).toMatchObject({ ok: true, state: { status: 'changes_requested', requestedBy: 3, approvals: [] } })
    expect(sent.ok && sent.events[0]).toEqual({ action: 'changes_requested', note: 'Fix the date' })
  })

  it('resubmitting after changes requested returns to review', () => {
    const result = transition({
      state: { status: 'changes_requested', requestedBy: 3, approvals: [] },
      action: 'submit',
      actor: author(3),
      required: 1,
      allowSelfApproval: false,
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, state: { status: 'in_review', requestedBy: 3 } })
  })

  it('withdraw returns to none for the author or a reviewer, not for a stranger', () => {
    const byAuthor = transition({ state: inReview(3), action: 'withdraw', actor: author(3), required: 1, allowSelfApproval: false, now: NOW })
    expect(byAuthor).toMatchObject({ ok: true, state: { status: 'none', requestedBy: null } })

    const byStranger = transition({ state: inReview(3), action: 'withdraw', actor: author(4), required: 1, allowSelfApproval: false, now: NOW })
    expect(byStranger).toMatchObject({ ok: false, status: 403 })

    const byReviewer = transition({ state: inReview(3), action: 'withdraw', actor: reviewer(9), required: 1, allowSelfApproval: false, now: NOW })
    expect(byReviewer).toMatchObject({ ok: true, state: { status: 'none' } })
  })

  it('approve and publish in one step ends at none and publishes', () => {
    const result = transition({ state: inReview(3), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: false, alsoPublish: true, now: NOW })
    expect(result).toMatchObject({ ok: true, publish: true, state: { status: 'none', requestedBy: null, approvals: [] } })
    expect(result.ok && result.events.map((event) => event.action)).toEqual(['approved', 'published'])
  })

  it('approve and publish records the approval but does not publish while approvals are still short', () => {
    const result = transition({ state: inReview(3), action: 'approve', actor: reviewer(9), required: 2, allowSelfApproval: false, alsoPublish: true, now: NOW })
    expect(result).toMatchObject({ ok: true, publish: false, state: { status: 'in_review' } })
  })

  it('publish is only from approved, and needs publish rights', () => {
    const fromReview = transition({ state: inReview(3), action: 'publish', actor: reviewer(9), required: 1, allowSelfApproval: false, now: NOW })
    expect(fromReview).toMatchObject({ ok: false, status: 409 })

    const approved: ReviewDocState = { status: 'approved', requestedBy: 3, approvals: [] }
    const noRights = transition({ state: approved, action: 'publish', actor: author(3), required: 1, allowSelfApproval: false, now: NOW })
    expect(noRights).toMatchObject({ ok: false, status: 403 })

    const ok = transition({ state: approved, action: 'publish', actor: { ...author(3), can: { submit: true, comment: true, review: false, publish: true } }, required: 1, allowSelfApproval: false, now: NOW })
    expect(ok).toMatchObject({ ok: true, publish: true, state: { status: 'none' } })
  })

  it('comment needs text and keeps the status', () => {
    const empty = transition({ state: inReview(3), action: 'comment', actor: author(4), required: 1, allowSelfApproval: false, note: '', now: NOW })
    expect(empty).toMatchObject({ ok: false, status: 400 })
    const ok = transition({ state: inReview(3), action: 'comment', actor: author(4), required: 1, allowSelfApproval: false, note: 'Looks good so far', now: NOW })
    expect(ok).toMatchObject({ ok: true, state: inReview(3) })
  })

  it('editing an approved document sends it back to review with approvals cleared; other states are untouched', () => {
    const approved: ReviewDocState = { status: 'approved', requestedBy: 3, approvals: [{ userId: 9, name: 'R', at: NOW }] }
    expect(resetOnEdit(approved)).toEqual({ status: 'in_review', requestedBy: 3, approvals: [] })
    const none: ReviewDocState = { status: 'none', requestedBy: null, approvals: [] }
    expect(resetOnEdit(none)).toBe(none)
    const changes: ReviewDocState = { status: 'changes_requested', requestedBy: 3, approvals: [] }
    expect(resetOnEdit(changes)).toBe(changes)
  })

  it('parses stored approvals defensively', () => {
    expect(parseApprovals('not json')).toEqual([])
    expect(parseApprovals([{ userId: 'x' }, null, { userId: 4, name: 'Ann', at: NOW }])).toEqual([{ userId: 4, name: 'Ann', at: NOW }])
  })
})

describe('rules and the publish gate', () => {
  it('reads the approval group, clamping counts and splitting the email list', () => {
    const settings = approvalSettingsFromGlobal({
      approval: { enabled: true, pagesApprovals: 5, postsApprovals: -1, eventsApprovals: 'abc', coursesApprovals: 2, productsApprovals: 1, allowSelfApproval: true, notifyReviewers: false, notifyEmails: 'a@x.com, bad\nb@y.org' },
    })
    expect(settings.enabled).toBe(true)
    expect(settings.requiredApprovals).toEqual({ pages: 3, posts: 0, events: 0, courses: 2, products: 1 })
    expect(settings.allowSelfApproval).toBe(true)
    expect(settings.notifyReviewers).toBe(false)
    expect(settings.notifyEmails).toEqual(['a@x.com', 'b@y.org'])
  })

  it('an empty global changes nothing', () => {
    expect(approvalSettingsFromGlobal(null)).toEqual(DISABLED_APPROVAL_SETTINGS)
    expect(approvalSettingsFromGlobal({})).toEqual(DISABLED_APPROVAL_SETTINGS)
    expect(requiredApprovalsFor(DISABLED_APPROVAL_SETTINGS, 'pages')).toBe(0)
  })

  it('blocks non-admin publishing of a collection that needs review, until approved', () => {
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'none', isAdmin: false })).toBe('This page needs approval before it can be published.')
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'in_review', isAdmin: false })).not.toBeNull()
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'approved', isAdmin: false })).toBeNull()
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'none', isAdmin: true })).toBeNull()
    expect(publishBlockMessage({ settings: ON, collection: 'events', reviewStatus: 'none', isAdmin: false })).toBeNull()
    expect(publishBlockMessage({ settings: DISABLED_APPROVAL_SETTINGS, collection: 'pages', reviewStatus: 'none', isAdmin: false })).toBeNull()
  })

  it('the review events collection is readable by review.read and never writable over REST', () => {
    const editor = { id: 2, roles: ['editor'] }
    const admin = { id: 1, roles: ['admin'] }
    const read = ReviewEvents.access?.read as unknown as (args: { req: { user: unknown } }) => boolean
    const create = ReviewEvents.access?.create as unknown as (args: { req: { user: unknown } }) => boolean
    expect(read({ req: { user: editor } })).toBe(true)
    expect(read({ req: { user: { id: 3, roles: ['customer'] } } })).toBe(false)
    expect(create({ req: { user: admin } })).toBe(false)
    expect(create({ req: { user: editor } })).toBe(false)
  })
})

describe('publish guard', () => {
  const editor = { id: 2, roles: ['editor'] }
  const admin = { id: 1, roles: ['admin'] }
  const engineWith = (settings: ApprovalSettings) => ({
    findGlobal: async () => ({
      approval: {
        enabled: settings.enabled,
        pagesApprovals: settings.requiredApprovals.pages,
        postsApprovals: settings.requiredApprovals.posts,
        eventsApprovals: settings.requiredApprovals.events,
        coursesApprovals: settings.requiredApprovals.courses,
        productsApprovals: settings.requiredApprovals.products,
        allowSelfApproval: settings.allowSelfApproval,
      },
    }),
  })

  const run = (args: { data: Record<string, any>; originalDoc?: Record<string, any>; user: unknown; operation: 'create' | 'update'; slug?: string; engine?: unknown }) =>
    publishGuard({
      data: args.data,
      originalDoc: args.originalDoc,
      req: { user: args.user, engine: args.engine ?? engineWith(DISABLED_APPROVAL_SETTINGS) },
      operation: args.operation,
      collection: { slug: args.slug ?? 'pages' },
    } as never)

  it('feature off: an editor with publish rights publishes exactly as before', async () => {
    const data: Record<string, any> = { _status: 'published' }
    await expect(run({ data, operation: 'update', user: editor, originalDoc: { _status: 'draft' } })).resolves.toBeUndefined()
    expect(data._status).toBe('published')
  })

  it('feature on with a requirement: an editor cannot publish from an ordinary save', async () => {
    const data: Record<string, any> = { _status: 'published' }
    await expect(
      run({ data, operation: 'update', user: editor, originalDoc: { _status: 'draft', reviewStatus: 'none' }, engine: engineWith(ON) }),
    ).rejects.toThrow(/needs approval before it can be published/)
  })

  it('admins bypass the gate', async () => {
    const data: Record<string, any> = { _status: 'published' }
    await expect(run({ data, operation: 'update', user: admin, originalDoc: { _status: 'draft' }, engine: engineWith(ON) })).resolves.toBeUndefined()
    expect(data.reviewStatus).toBe('none')
  })

  it('a collection with no requirement is not gated', async () => {
    const data: Record<string, any> = { _status: 'published' }
    await expect(run({ data, operation: 'update', user: editor, slug: 'events', originalDoc: { _status: 'draft' }, engine: engineWith(ON) })).resolves.toBeUndefined()
  })

  it('clients cannot set review fields: the stored values win on update', async () => {
    const data: Record<string, any> = { _status: 'draft', reviewStatus: 'approved', reviewApprovals: [{ userId: 9, name: 'x', at: NOW }] }
    await run({ data, operation: 'update', user: editor, originalDoc: { _status: 'draft', reviewStatus: 'in_review', reviewRequestedBy: 2, reviewApprovals: [] } })
    expect(data.reviewStatus).toBe('in_review')
    expect(parseApprovals(data.reviewApprovals)).toEqual([])
    expect(data.reviewRequestedBy).toBe(2)
  })

  it('editing an approved document takes it back to review', async () => {
    const data: Record<string, any> = { _status: 'draft' }
    await run({ data, operation: 'update', user: editor, originalDoc: { _status: 'draft', reviewStatus: 'approved', reviewRequestedBy: 2, reviewApprovals: [{ userId: 9, name: 'R', at: NOW }] } })
    expect(data.reviewStatus).toBe('in_review')
    expect(parseApprovals(data.reviewApprovals)).toEqual([])
  })

  it('create starts with no review, and system writes are never touched', async () => {
    const created: Record<string, any> = { _status: 'draft', reviewStatus: 'approved' }
    await run({ data: created, operation: 'create', user: editor })
    expect(created.reviewStatus).toBe('none')

    const system: Record<string, any> = { _status: 'published', reviewStatus: 'approved' }
    await publishGuard({ data: system, req: {}, operation: 'update', collection: { slug: 'pages' } } as never)
    expect(system.reviewStatus).toBe('approved')
  })
})

describe('scheduled publish', () => {
  const engineFor = (doc: Record<string, unknown>, settings: ApprovalSettings) => {
    const updates: Array<Record<string, unknown>> = []
    const engine = {
      findByID: vi.fn(async () => doc),
      update: vi.fn(async (args: Record<string, unknown>) => {
        updates.push(args)
        return doc
      }),
      findGlobal: vi.fn(async () => ({
        approval: { enabled: settings.enabled, pagesApprovals: settings.requiredApprovals.pages, allowSelfApproval: false },
      })),
    }
    return { engine, updates }
  }

  beforeEach(() => {
    listDue.mockReset()
    markDone.mockReset()
    sendEmail.mockClear()
  })

  it('skips a document that is not approved, leaves it due, and reports why', async () => {
    listDue.mockResolvedValueOnce([{ collection: 'pages', docId: 5, action: 'publish' }])
    const { engine, updates } = engineFor({ id: 5, reviewStatus: 'in_review' }, ON)
    const result = await runDueSchedules(engine as never, {} as never, NOW)
    expect(updates).toHaveLength(0)
    expect(markDone).not.toHaveBeenCalled()
    expect(result.skipped).toEqual([{ collection: 'pages', docId: 5, action: 'publish', reason: 'This page needs approval before it can be published.' }])
  })

  it('publishes an approved document and clears its review', async () => {
    listDue.mockResolvedValueOnce([{ collection: 'pages', docId: 6, action: 'publish' }])
    const { engine, updates } = engineFor({ id: 6, reviewStatus: 'approved' }, ON)
    const result = await runDueSchedules(engine as never, {} as never, NOW)
    expect(result.published).toEqual([{ collection: 'pages', docId: 6 }])
    expect(updates[0]).toMatchObject({ data: { _status: 'published', reviewStatus: 'none', reviewApprovals: [] }, overrideAccess: true })
    expect(markDone).toHaveBeenCalledWith(expect.anything(), 'pages', 6, 'publish')
  })

  it('with the rules off, a draft publishes as before', async () => {
    listDue.mockResolvedValueOnce([{ collection: 'pages', docId: 7, action: 'publish' }])
    const { engine, updates } = engineFor({ id: 7, reviewStatus: 'none' }, DISABLED_APPROVAL_SETTINGS)
    await runDueSchedules(engine as never, {} as never, NOW)
    expect(updates[0]).toMatchObject({ data: { _status: 'published' } })
    expect(updates[0].data).not.toHaveProperty('reviewStatus')
  })
})

describe('permission matrix', () => {
  const editor = { id: 2, roles: ['editor'] }
  const viewer = { id: 3, roles: ['viewer'] }
  const customer = { id: 4, roles: ['customer'] }
  const reviewerWithGrant = { id: 5, roles: ['editor'], permissionOverrides: { grant: { review: { publish: true } } } }

  it('review is a resource in the content category, with read, update and publish', () => {
    expect(RESOURCES).toContain('review')
    const content = PERMISSION_CATEGORIES.find((category) => category.id === 'content')
    const row = content?.rows.find((r) => r.resource === 'review')
    expect(row?.actions).toEqual(['read', 'update', 'publish'])
  })

  it('editors can submit and comment, but cannot approve', () => {
    expect(can(editor, 'review', 'read')).toBe(true)
    expect(can(editor, 'review', 'update')).toBe(true)
    expect(can(editor, 'review', 'publish')).toBe(false)
    expect(BUILT_IN_ROLES.editor.review).toEqual({ read: true, update: true })
  })

  it('viewers can read the queue only, and customers see nothing', () => {
    expect(can(viewer, 'review', 'read')).toBe(true)
    expect(can(viewer, 'review', 'update')).toBe(false)
    expect(can(customer, 'review', 'read')).toBe(false)
  })

  it('an editor granted review.publish is a reviewer', () => {
    expect(can(reviewerWithGrant, 'review', 'publish')).toBe(true)
  })

  it('admins hold every review right', () => {
    expect(can({ id: 1, roles: ['admin'] }, 'review', 'publish')).toBe(true)
  })
})

describe('review handlers', () => {
  type Doc = Record<string, any>
  const users: Doc[] = [
    { id: 2, name: 'Ed Editor', email: 'ed@example.com', roles: ['editor'] },
    { id: 5, name: 'Rae Reviewer', email: 'rae@example.com', roles: ['editor'], permissionOverrides: { grant: { review: { publish: true } } } },
    { id: 1, name: 'Ada Admin', email: 'ada@example.com', roles: ['admin'] },
  ]

  const makeEngine = (options: { doc: Doc | null; settings?: ApprovalSettings; events?: Doc[] }) => {
    const updates: Array<Record<string, any>> = []
    const creates: Array<Record<string, any>> = []
    const engine = {
      updates,
      creates,
      find: vi.fn(async (args: Record<string, any>) => {
        if (args.collection === 'users') return { docs: users }
        if (args.collection === 'review-events') return { docs: options.events ?? [] }
        return { docs: [] }
      }),
      findByID: vi.fn(async (args: Record<string, any>) => {
        if (args.collection === 'users') return users.find((user) => user.id === args.id) ?? null
        if (args.collection === 'pages') return options.doc
        return null
      }),
      update: vi.fn(async (args: Record<string, any>) => {
        updates.push(args)
        return {}
      }),
      create: vi.fn(async (args: Record<string, any>) => {
        creates.push(args)
        return {}
      }),
      findGlobal: vi.fn(async () => ({
        approval: {
          enabled: (options.settings ?? ON).enabled,
          pagesApprovals: (options.settings ?? ON).requiredApprovals.pages,
          allowSelfApproval: false,
          notifyReviewers: true,
        },
      })),
    }
    return engine
  }

  const viewerFor = (user: Doc): ReviewViewer => {
    const account = user
    return {
      id: account.id as number,
      name: account.name as string,
      isAdmin: (account.roles as string[]).includes('admin'),
      can: (resource, action) => can(account as never, resource, action),
    }
  }

  const pageDoc = (overrides: Doc = {}): Doc => ({ id: 5, title: 'Spring', _status: 'draft', reviewStatus: 'none', reviewRequestedBy: null, reviewApprovals: [], ...overrides })

  beforeEach(() => {
    sendEmail.mockClear()
  })

  it('GET refuses a user who cannot read review', async () => {
    const engine = makeEngine({ doc: pageDoc() })
    const result = await handleReviewGet({ engine: engine as never, viewer: viewerFor({ id: 9, name: 'C', roles: ['customer'] }), collection: 'pages', id: '5', now: NOW })
    expect(result.status).toBe(403)
  })

  it('POST rejects bad input before touching the document', async () => {
    const engine = makeEngine({ doc: pageDoc() })
    const viewer = viewerFor(users[0])
    expect((await handleReviewPost({ engine: engine as never, viewer, origin: 'https://x.test', body: { collection: 'nope', id: 5, action: 'submit' } })).status).toBe(400)
    expect((await handleReviewPost({ engine: engine as never, viewer, origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'delete' } })).status).toBe(400)
    expect((await handleReviewPost({ engine: engine as never, viewer, origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'comment', note: 'x'.repeat(2001) as string } })).status).toBe(400)
    expect(engine.updates).toHaveLength(0)
  })

  it('POST is refused with the rules off', async () => {
    const engine = makeEngine({ doc: pageDoc(), settings: DISABLED_APPROVAL_SETTINGS })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[0]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'submit' } })
    expect(result.status).toBe(409)
  })

  it('an editor submits: the document is updated, a history row is written and reviewers are emailed', async () => {
    const engine = makeEngine({ doc: pageDoc() })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[0]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'submit' }, now: NOW })
    expect(result).toMatchObject({ status: 200, body: { ok: true, status: 'in_review' } })
    expect(engine.updates[0]).toMatchObject({ collection: 'pages', id: 5, overrideAccess: true, data: { reviewStatus: 'in_review', reviewRequestedBy: 2, reviewRequestedAt: NOW } })
    expect(engine.creates[0]).toMatchObject({ collection: 'review-events', overrideAccess: true, data: { action: 'submitted', docId: 5, actor: 2 } })
    const recipients = sendEmail.mock.calls.map((call) => (call as unknown as [{ to: string }])[0].to)
    expect(recipients.sort()).toEqual(['ada@example.com', 'rae@example.com'])
  })

  it('an editor cannot approve', async () => {
    const engine = makeEngine({ doc: pageDoc({ _status: 'draft', reviewStatus: 'in_review', reviewRequestedBy: 5 }) })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[0]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' } })
    expect(result.status).toBe(403)
    expect(engine.updates).toHaveLength(0)
  })

  it('a reviewer approves, the author is emailed, and the history row says so', async () => {
    const engine = makeEngine({ doc: pageDoc({ reviewStatus: 'in_review', reviewRequestedBy: 2, reviewRequestedAt: NOW }) })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[1]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' }, now: NOW })
    expect(result).toMatchObject({ status: 200, body: { status: 'approved', published: false } })
    expect(engine.updates[0].data).toMatchObject({ reviewStatus: 'approved', reviewRequestedBy: 2 })
    expect(engine.creates[0].data).toMatchObject({ action: 'approved', actor: 5 })
    const recipients = sendEmail.mock.calls.map((call) => (call as unknown as [{ to: string }])[0].to)
    expect(recipients).toEqual(['ed@example.com'])
  })

  it('a reviewer can approve and publish in one step', async () => {
    const engine = makeEngine({ doc: pageDoc({ reviewStatus: 'in_review', reviewRequestedBy: 2 }) })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[1]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve', alsoPublish: true }, now: NOW })
    expect(result).toMatchObject({ status: 200, body: { status: 'none', published: true } })
    expect(engine.updates[0].data).toMatchObject({ _status: 'published', reviewStatus: 'none' })
    expect(engine.creates.map((create) => create.data.action)).toEqual(['approved', 'published'])
  })

  it('publishing an approved document goes through the route, and a draft cannot be submitted while live', async () => {
    const approved = makeEngine({ doc: pageDoc({ reviewStatus: 'approved', reviewRequestedBy: 2 }) })
    const published = await handleReviewPost({ engine: approved as never, viewer: viewerFor(users[1]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'publish' }, now: NOW })
    expect(published.status).toBe(200)
    expect(approved.updates[0].data).toMatchObject({ _status: 'published', reviewStatus: 'none' })

    const live = makeEngine({ doc: pageDoc({ _status: 'published' }) })
    const refused = await handleReviewPost({ engine: live as never, viewer: viewerFor(users[0]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'submit' } })
    expect(refused.status).toBe(409)
  })

  it('a comment is recorded without changing the document', async () => {
    const engine = makeEngine({ doc: pageDoc({ reviewStatus: 'in_review', reviewRequestedBy: 2 }) })
    const result = await handleReviewPost({ engine: engine as never, viewer: viewerFor(users[0]), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'comment', note: 'Check the photo' } })
    expect(result.status).toBe(200)
    expect(engine.updates).toHaveLength(0)
    expect(engine.creates[0].data).toMatchObject({ action: 'comment', note: 'Check the photo' })
  })

  it('GET reports what the viewer may do and the history', async () => {
    const events: Array<Record<string, unknown>> = [{ id: 1, action: 'submitted', note: null as string | null, actorName: 'Ed Editor', createdAt: NOW }]
    const engine = makeEngine({ doc: pageDoc({ reviewStatus: 'in_review', reviewRequestedBy: 2, reviewRequestedAt: NOW }), events })
    const result = await handleReviewGet({ engine: engine as never, viewer: viewerFor(users[1]), collection: 'pages', id: '5', now: NOW })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ enabled: true, status: 'in_review', requiredApprovals: 1, publishBlocked: 'This page needs approval before it can be published.' })
    expect(result.body.allowed).toMatchObject({ approve: true, requestChanges: true, submit: false, publish: false })
    expect(result.body.history).toEqual(events)
  })

  it('the queue lists reviewable documents for reviewers, and only own submissions for editors', async () => {
    const rows: Doc[] = [{ id: 7, title: 'Summer', reviewRequestedBy: { id: 2, name: 'Ed Editor' }, reviewRequestedAt: NOW }]
    const engine = {
      ...makeEngine({ doc: null }),
      find: vi.fn(async (args: Record<string, any>) => {
        if (args.collection === 'pages') return { docs: rows }
        return { docs: [] }
      }),
    }
    const reviewerRows = await loadReviewQueue({ engine: engine as never, viewer: viewerFor(users[1]), settings: ON })
    expect(reviewerRows).toEqual([{ collection: 'pages', id: 7, title: 'Summer', requestedBy: 'Ed Editor', requestedAt: NOW, href: '/admin/collections/pages/7' }])

    const editorRows = await loadReviewQueue({ engine: engine as never, viewer: viewerFor(users[0]), settings: ON })
    expect(editorRows).toHaveLength(1)
    const lastFind = engine.find.mock.calls.at(-1)?.[0] as Record<string, any>
    expect(JSON.stringify(lastFind.where)).toContain('reviewRequestedBy')
  })
})

describe('admin self-approval', () => {
  const adminReviewer = (id: number): ReviewActor => ({ ...reviewer(id), isAdmin: true })

  it('an admin cannot approve their own change when adminsMaySelfApprove is off', () => {
    const result = transition({ state: inReview(9), action: 'approve', actor: adminReviewer(9), required: 1, allowSelfApproval: false, adminsMaySelfApprove: false, now: NOW })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('an admin can approve their own change when adminsMaySelfApprove is on', () => {
    const result = transition({ state: inReview(9), action: 'approve', actor: adminReviewer(9), required: 1, allowSelfApproval: false, adminsMaySelfApprove: true, now: NOW })
    expect(result).toMatchObject({ ok: true, state: { status: 'approved' } })
  })

  it('an admin can approve their own change when the input leaves the setting out (the old behaviour)', () => {
    const result = transition({ state: inReview(9), action: 'approve', actor: adminReviewer(9), required: 1, allowSelfApproval: false, now: NOW })
    expect(result).toMatchObject({ ok: true, state: { status: 'approved' } })
  })

  it('allowSelfApproval lets a non-admin reviewer approve their own change, and adminsMaySelfApprove does not help a non-admin', () => {
    const allowed = transition({ state: inReview(9), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: true, adminsMaySelfApprove: false, now: NOW })
    expect(allowed).toMatchObject({ ok: true })
    const notHelped = transition({ state: inReview(9), action: 'approve', actor: reviewer(9), required: 1, allowSelfApproval: false, adminsMaySelfApprove: true, now: NOW })
    expect(notHelped).toMatchObject({ ok: false, status: 403 })
  })

  it('reads the setting: absent or true is on, false is off', () => {
    expect(approvalSettingsFromGlobal({ approval: {} }).adminsMaySelfApprove).toBe(true)
    expect(approvalSettingsFromGlobal({ approval: { adminsMaySelfApprove: true } }).adminsMaySelfApprove).toBe(true)
    expect(approvalSettingsFromGlobal({ approval: { adminsMaySelfApprove: false } }).adminsMaySelfApprove).toBe(false)
  })
})

describe('approval settings that cannot be read', () => {
  beforeEach(() => {
    resetApprovalSettingsCacheForTests()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  const failing = { findGlobal: async () => { throw new Error('db down') } }

  it('with no earlier good copy, the rules are unknown and non-admins cannot publish', async () => {
    const settings = await loadApprovalSettings(failing)
    expect(settings.unknown).toBe(true)
    expect(publishBlockMessage({ settings, collection: 'pages', reviewStatus: 'none', isAdmin: false })).toBe('Approval settings could not be loaded; try again.')
    expect(publishBlockMessage({ settings, collection: 'pages', reviewStatus: 'none', isAdmin: true })).toBeNull()
  })

  it('after a good read, a failed read keeps the last good settings', async () => {
    await loadApprovalSettings({ findGlobal: async () => ({ approval: { enabled: true, pagesApprovals: 2 } }) })
    const settings = await loadApprovalSettings(failing)
    expect(settings.unknown).toBeUndefined()
    expect(settings).toMatchObject({ enabled: true, requiredApprovals: { pages: 2 } })
  })

  it('the review route refuses a review step while the rules are unknown', async () => {
    const updates: unknown[] = []
    const engine = {
      find: async (): Promise<{ docs: unknown[] }> => ({ docs: [] }),
      findByID: async (args: Record<string, unknown>) => (args.collection === 'users' ? { id: 5, name: 'Rae', roles: ['editor'] } : pageRow()),
      update: async (args: unknown) => (updates.push(args), {}),
      create: async (): Promise<Record<string, never>> => ({}),
      findGlobal: failing.findGlobal,
    }
    const viewer: ReviewViewer = { id: 5, name: 'Rae', isAdmin: true, can: () => true }
    const result = await handleReviewPost({ engine: engine as never, viewer, origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' } })
    expect(result).toMatchObject({ status: 503, body: { error: SETTINGS_UNAVAILABLE_MESSAGE } })
    expect(updates).toHaveLength(0)
  })
})

const pageRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 5,
  title: 'Spring',
  _status: 'draft',
  reviewStatus: 'in_review',
  reviewRequestedBy: 2,
  reviewApprovals: [],
  updatedAt: NOW,
  ...overrides,
})

const reviewViewerAs = (id: number, name: string): ReviewViewer => ({ id, name, isAdmin: false, can: () => true })

describe('review handlers: privacy and concurrency', () => {
  const users = [
    { id: 2, name: 'Ed Editor', email: 'ed@example.com', roles: ['editor'] },
    { id: 5, name: 'Rae Reviewer', email: 'rae@example.com', roles: ['editor'], permissionOverrides: { grant: { review: { publish: true } } } },
    { id: 6, email: 'noname@example.com', roles: ['editor'] },
  ]
  const onSettings = { findGlobal: async () => ({ approval: { enabled: true, pagesApprovals: 1, allowSelfApproval: false } }) }

  const engineFor = (pageReads: Array<Record<string, unknown>>) => {
    const updates: Array<Record<string, any>> = []
    let reads = 0
    return {
      updates,
      find: async (args: Record<string, any>) => (args.collection === 'pages' ? { docs: [pageRow({ reviewRequestedBy: { id: 6, email: 'noname@example.com' } })] } : { docs: [] }),
      findByID: async (args: Record<string, any>) => {
        if (args.collection === 'users') return users.find((user) => user.id === args.id) ?? null
        reads++
        return pageReads[Math.min(reads, pageReads.length) - 1]
      },
      update: async (args: Record<string, any>) => (updates.push(args), {}),
      create: async () => ({}),
      findGlobal: onSettings.findGlobal,
    }
  }

  it('GET names the requester and never returns an email address', async () => {
    const engine = engineFor([pageRow({ reviewRequestedBy: 6 })])
    const result = await handleReviewGet({ engine: engine as never, viewer: reviewViewerAs(5, 'Rae'), collection: 'pages', id: '5', now: NOW })
    expect(result.status).toBe(200)
    expect(result.body.requestedBy).toEqual({ id: 6, name: 'Unknown user' })
    expect(JSON.stringify(result.body)).not.toContain('noname@example.com')
  })

  it('the queue names the requester and never returns an email address', async () => {
    const engine = engineFor([pageRow()])
    const rows = await loadReviewQueue({ engine: engine as never, viewer: reviewViewerAs(5, 'Rae'), settings: { ...DISABLED_APPROVAL_SETTINGS, enabled: true, requiredApprovals: { ...DISABLED_APPROVAL_SETTINGS.requiredApprovals, pages: 1 } } })
    expect(rows[0].requestedBy).toBe('Unknown user')
    expect(JSON.stringify(rows)).not.toContain('noname@example.com')
  })

  it('POST refuses with 409 when the document changed between the read and the write (status)', async () => {
    const engine = engineFor([pageRow({ reviewRequestedBy: 2 }), pageRow({ reviewRequestedBy: 2, reviewStatus: 'none' })])
    const result = await handleReviewPost({ engine: engine as never, viewer: reviewViewerAs(5, 'Rae'), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' }, now: NOW })
    expect(result.status).toBe(409)
    expect(engine.updates).toHaveLength(0)
  })

  it('POST refuses with 409 when the document was saved between the read and the write (timestamp)', async () => {
    const engine = engineFor([pageRow({ reviewRequestedBy: 2 }), pageRow({ reviewRequestedBy: 2, updatedAt: '2026-10-10T10:00:05.000Z' })])
    const result = await handleReviewPost({ engine: engine as never, viewer: reviewViewerAs(5, 'Rae'), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' }, now: NOW })
    expect(result.status).toBe(409)
    expect(engine.updates).toHaveLength(0)
  })

  it('POST stores the approvals with a hash of the content they were given against', async () => {
    const engine = engineFor([pageRow({ reviewRequestedBy: 2, title: 'Spring' })])
    const result = await handleReviewPost({ engine: engine as never, viewer: reviewViewerAs(5, 'Rae'), origin: 'https://x.test', body: { collection: 'pages', id: 5, action: 'approve' }, now: NOW })
    expect(result.status).toBe(200)
    const stored = parseStoredReview(engine.updates[0].data.reviewApprovals)
    expect(stored.hash).toBe(hashReviewedContent(pageRow({ reviewRequestedBy: 2, title: 'Spring' })))
    expect(stored.approvals).toHaveLength(1)
  })
})

describe('reviewer lookup pages through every user', () => {
  const adminsFrom = (page: number, size: number) =>
    Array.from({ length: size }, (_, i) => ({ id: (page - 1) * size + i + 1, email: `a${(page - 1) * size + i + 1}@x.test`, roles: ['admin'] }))

  it('finds a reviewer on the third page of users', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, email: `a${i + 1}@x.test`, roles: ['admin'] }))
    const engine = {
      find: vi.fn(async (args: Record<string, any>) => {
        const page = args.page ?? 1
        return { docs: all.slice((page - 1) * args.limit, page * args.limit) }
      }),
      findByID: vi.fn(),
    }
    const addresses = await reviewerAddresses(engine as never, 'pages', null)
    expect(addresses).toHaveLength(1200)
    expect(addresses).toContain('a1150@x.test')
    expect(engine.find).toHaveBeenCalledTimes(3)
  })

  it('stops at the cap, however many users there are', async () => {
    const engine = {
      find: vi.fn(async (args: Record<string, any>) => ({ docs: adminsFrom(args.page ?? 1, 500) })),
      findByID: vi.fn(),
    }
    await reviewerAddresses(engine as never, 'pages', null)
    expect(MAX_REVIEWER_SCAN).toBe(5000)
    expect(engine.find).toHaveBeenCalledTimes(MAX_REVIEWER_SCAN / 500)
  })
})

describe('content changes while in review', () => {
  const editorUser = { id: 2, roles: ['editor'] }
  const base = { _status: 'draft', title: 'Spring', slug: 'spring', blocks: [{ id: 'b1', blockType: 'richText' }], reviewStatus: 'in_review', reviewRequestedBy: 2, reviewRequestedAt: NOW }
  const withApprovals = (doc: Record<string, unknown>) => ({
    ...doc,
    reviewApprovals: serializeStoredReview({ hash: hashReviewedContent(doc), approvals: [{ userId: 9, name: 'R', at: NOW }] }),
  })
  const save = (data: Record<string, any>, originalDoc: Record<string, any>) =>
    publishGuard({ data, originalDoc, req: { user: editorUser, engine: { findGlobal: async () => ({}) } }, operation: 'update', collection: { slug: 'pages' } } as never)

  it('editing the content clears the approvals and keeps the document in review', async () => {
    const data: Record<string, any> = { title: 'Summer' }
    await save(data, withApprovals(base))
    expect(data.reviewStatus).toBe('in_review')
    expect(parseStoredReview(data.reviewApprovals).approvals).toEqual([])
  })

  it('a save with the same content keeps the approvals', async () => {
    const data: Record<string, any> = { title: 'Spring' }
    await save(data, withApprovals(base))
    expect(data.reviewStatus).toBe('in_review')
    expect(parseStoredReview(data.reviewApprovals).approvals).toEqual([{ userId: 9, name: 'R', at: NOW }])
  })

  it('a document stored in the old array shape (no hash) loses its approvals on the next save', async () => {
    const data: Record<string, any> = { _status: 'draft' }
    await save(data, { ...base, reviewApprovals: [{ userId: 9, name: 'R', at: NOW }] })
    expect(data.reviewStatus).toBe('in_review')
    expect(parseStoredReview(data.reviewApprovals).approvals).toEqual([])
  })

  it('the old array shape still reads, with no hash', () => {
    expect(parseStoredReview([{ userId: 4, name: 'Ann', at: NOW }])).toEqual({ hash: null, approvals: [{ userId: 4, name: 'Ann', at: NOW }] })
    expect(parseStoredReview({ hash: 'abc', approvals: [{ userId: 4, name: 'Ann', at: NOW }] }).hash).toBe('abc')
  })

  it('resetOnEdit clears approvals on a content change in review, and leaves them when the content is unchanged', () => {
    const state = { status: 'in_review' as const, requestedBy: 3, approvals: [{ userId: 9, name: 'R', at: NOW }] }
    expect(resetOnEdit(state, true)).toEqual({ status: 'in_review', requestedBy: 3, approvals: [] })
    expect(resetOnEdit(state, false)).toBe(state)
  })

  it('the content hash ignores key order and fields outside the reviewed content', () => {
    const a = hashReviewedContent({ title: 'a', blocks: [{ x: 1, y: 2 }], updatedAt: 'one' })
    expect(hashReviewedContent({ blocks: [{ y: 2, x: 1 }], title: 'a', updatedAt: 'two' })).toBe(a)
    expect(hashReviewedContent({ title: 'b', blocks: [{ x: 1, y: 2 }] })).not.toBe(a)
  })
})

describe('migration: the self-approval setting column', () => {
  const securityColumns = ['id', 'approval_enabled', 'approval_allow_self_approval', 'approval_notify_reviewers', 'approval_notify_emails']

  const runMigration = async (columns: string[]): Promise<string[]> => {
    const statements: string[] = []
    const db = {
      all: async (query: unknown) => {
        const text = JSON.stringify(query)
        if (!text.includes('eg_security_settings')) return []
        return columns.map((name) => ({ name }))
      },
      run: async (query: unknown) => {
        statements.push(JSON.stringify(query))
        return {}
      },
    }
    await up20261011({ db, engine: { logger: { info: (): undefined => undefined } } } as never)
    return statements
  }

  it('adds the column to the security settings when it is missing', async () => {
    const statements = await runMigration(securityColumns)
    const added = statements.filter((text) => text.includes('approval_admins_may_self_approve'))
    expect(added).toHaveLength(1)
    expect(added[0]).toContain('ALTER TABLE')
  })

  it('does nothing for the column when it is already there (safe to replay)', async () => {
    const statements = await runMigration([...securityColumns, 'approval_admins_may_self_approve'])
    expect(statements.some((text) => text.includes('approval_admins_may_self_approve'))).toBe(false)
  })
})

describe('the notification address list is admin-only', () => {
  const approvalGroup = SecuritySettings.fields.find((field) => 'name' in field && field.name === 'approval') as unknown as { fields: Array<Record<string, any>> }
  const notifyEmails = approvalGroup.fields.find((field) => field.name === 'notifyEmails') as Record<string, any>
  const readable = (user: unknown) => notifyEmails.access.read({ req: { user } }) as boolean

  it('only admins can read the extra addresses', () => {
    expect(readable({ id: 1, roles: ['admin'] })).toBe(true)
    expect(readable({ id: 2, roles: ['editor'] })).toBe(false)
    expect(readable(null)).toBe(false)
  })

  it('the self-approval toggle is in the group with its default on', () => {
    const toggle = approvalGroup.fields.flatMap((field) => (field.fields ? field.fields : [field])).find((field: Record<string, any>) => field.name === 'adminsMaySelfApprove') as Record<string, any>
    expect(toggle).toMatchObject({ type: 'checkbox', defaultValue: true })
  })
})
