// @vitest-environment node
/**
 * Approval workflows: multi-step review per content type. The state machine, the loader and its
 * fail-closed behaviour, the publish gate, the review handlers end to end, who gets emailed
 * (including people on a custom role), validation and access on the collection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ ok: true }) as unknown))
vi.mock('@/features/email', () => ({ sendEmail }))
vi.mock('@/features/speed/purge', () => ({ purgeCache: vi.fn(async () => ({})) }))

import { handleReviewGet, handleReviewPost, loadReviewQueue } from '@/features/approval/handlers'
import { reviewerAddresses } from '@/features/approval/notify'
import type { ReviewViewer } from '@/features/approval/permissions'
import { roleSlugsOfUser } from '@/features/approval/roleSlugs'
import {
  DISABLED_APPROVAL_SETTINGS,
  SETTINGS_UNAVAILABLE_MESSAGE,
  activeWorkflowFor,
  loadApprovalSettings,
  publishBlockMessage,
  requiredApprovalsFor,
  resetApprovalSettingsCacheForTests,
  type ApprovalSettings,
} from '@/features/approval/settings'
import { resetOnEdit, transition, type ReviewActor, type ReviewDocState } from '@/features/approval/stateMachine'
import {
  describeAwaiting,
  loadActiveWorkflows,
  maySubmitUnder,
  parseWorkflow,
  resetWorkflowCacheForTests,
  validateWorkflowInput,
  type ApprovalWorkflow,
} from '@/features/approval/workflows'
import { ApprovalWorkflows, validateWorkflowBeforeChange } from '@/features/approval/workflowCollection'
import { reviewFields } from '@/features/approval/fields'
import { publishGuard } from '@/features/roles/contentEditGuard'
import { can } from '@/features/roles/permissions'

const NOW = '2026-10-12T10:00:00.000Z'

const FLOW: ApprovalWorkflow = {
  id: 7,
  name: 'Editorial then legal',
  collection: 'pages',
  active: true,
  submitterRoles: [],
  steps: [
    { name: 'Editor review', approverRoles: ['editor'], approverNames: ['Editor'], approvalsNeeded: 1 },
    { name: 'Legal review', approverRoles: ['legal'], approverNames: ['Legal'], approvalsNeeded: 2 },
  ],
}

const ON: ApprovalSettings = {
  ...DISABLED_APPROVAL_SETTINGS,
  enabled: true,
  requiredApprovals: { pages: 0, posts: 1, events: 0, courses: 0, products: 0 },
  workflows: { pages: FLOW },
}

const actor = (id: number, roleSlugs: string[], overrides: Partial<ReviewActor> = {}): ReviewActor => ({
  id,
  name: `User ${id}`,
  isAdmin: false,
  roleSlugs,
  can: { submit: true, comment: true, review: true, publish: true },
  ...overrides,
})

const inReview = (step: number, approvals: ReviewDocState['approvals'] = [], requestedBy = 3): ReviewDocState => ({
  status: 'in_review',
  requestedBy,
  approvals,
  step,
})

const run = (state: ReviewDocState, action: Parameters<typeof transition>[0]['action'], who: ReviewActor, extra: Partial<Parameters<typeof transition>[0]> = {}) =>
  transition({ state, action, actor: who, required: 0, allowSelfApproval: false, workflow: FLOW, now: NOW, ...extra })

describe('workflow state machine', () => {
  it('submit starts at step 0, and records the step on the history row', () => {
    const result = run({ status: 'none', requestedBy: null, approvals: [] }, 'submit', actor(3, ['editor']))
    expect(result).toMatchObject({ ok: true, state: { status: 'in_review', step: 0, approvals: [] } })
    expect(result.ok && result.events).toEqual([{ action: 'submitted', note: null, step: 'Editor review' }])
  })

  it('submit is limited to submitterRoles when the workflow lists some; admins always may', () => {
    const restricted: ApprovalWorkflow = { ...FLOW, submitterRoles: ['writer'] }
    const blank: ReviewDocState = { status: 'none', requestedBy: null, approvals: [] }
    expect(run(blank, 'submit', actor(3, ['editor']), { workflow: restricted })).toMatchObject({ ok: false, status: 403 })
    expect(run(blank, 'submit', actor(3, ['editor', 'writer']), { workflow: restricted })).toMatchObject({ ok: true })
    expect(run(blank, 'submit', actor(1, ['admin'], { isAdmin: true }), { workflow: restricted })).toMatchObject({ ok: true })
    // The base rule still applies: a role that cannot edit cannot submit just by being listed.
    expect(run(blank, 'submit', actor(3, ['writer'], { can: { submit: false, comment: true, review: false, publish: false } }), { workflow: restricted })).toMatchObject({ ok: false, status: 403 })
    expect(maySubmitUnder(FLOW, [], false)).toBe(true)
  })

  it('only the current step approvers may approve; the message names the step and role', () => {
    const wrongRole = run(inReview(0), 'approve', actor(4, ['legal']))
    expect(wrongRole).toMatchObject({ ok: false, status: 403 })
    const message = 'error' in wrongRole ? wrongRole.error : ''
    expect(message).toContain('Editor review')
    expect(message).toContain('Editor')
    expect(run(inReview(0), 'approve', actor(4, ['editor']))).toMatchObject({ ok: true })
    expect(run(inReview(1), 'approve', actor(4, ['editor']))).toMatchObject({ ok: false, status: 403 })
  })

  it('admins may approve any step', () => {
    expect(run(inReview(1), 'approve', actor(1, ['admin'], { isAdmin: true }))).toMatchObject({ ok: true })
  })

  it('a user with no role slugs (roles could not be read) cannot approve a step', () => {
    expect(run(inReview(0), 'approve', actor(4, []))).toMatchObject({ ok: false, status: 403 })
  })

  it('finishing a step moves to the next one with approvals cleared', () => {
    const result = run(inReview(0), 'approve', actor(4, ['editor']))
    expect(result).toMatchObject({ ok: true, publish: false, advancedTo: 1, state: { status: 'in_review', step: 1, approvals: [] } })
    expect(result.ok && result.events).toEqual([{ action: 'approved', note: null, step: 'Editor review' }])
  })

  it('a step with two approvals stays put after one, needs a second person, then the review is approved', () => {
    const first = run(inReview(1), 'approve', actor(5, ['legal']))
    expect(first).toMatchObject({ ok: true, state: { status: 'in_review', step: 1 } })
    expect(first.ok && first.state.approvals).toHaveLength(1)
    const again = run(first.ok ? first.state : inReview(1), 'approve', actor(5, ['legal']))
    expect(again).toMatchObject({ ok: false, status: 409 })
    const second = run(first.ok ? first.state : inReview(1), 'approve', actor(6, ['legal']))
    expect(second).toMatchObject({ ok: true, state: { status: 'approved', step: 1 } })
    expect(second.ok && second.advancedTo).toBeUndefined()
  })

  it('approve and publish only publishes once the last step is complete', () => {
    const early = run(inReview(0), 'approve', actor(4, ['editor']), { alsoPublish: true })
    expect(early).toMatchObject({ ok: true, publish: false, advancedTo: 1 })
    const last = run(inReview(1, [{ userId: 5, name: 'a', at: NOW }]), 'approve', actor(6, ['legal']), { alsoPublish: true })
    expect(last).toMatchObject({ ok: true, publish: true, state: { status: 'none', step: 0 } })
  })

  it('self-approval rules from settings still apply inside a step', () => {
    const own = inReview(0, [], 4)
    expect(run(own, 'approve', actor(4, ['editor']))).toMatchObject({ ok: false, status: 403 })
    expect(run(own, 'approve', actor(4, ['editor']), { allowSelfApproval: true })).toMatchObject({ ok: true })
    expect(run(own, 'approve', actor(4, ['admin'], { isAdmin: true }), { adminsMaySelfApprove: false })).toMatchObject({ ok: false, status: 403 })
  })

  it('requesting changes resets to step 0, and only the current step may do it', () => {
    expect(run(inReview(1), 'request_changes', actor(4, ['editor']), { note: 'no' })).toMatchObject({ ok: false, status: 403 })
    const result = run(inReview(1), 'request_changes', actor(5, ['legal']), { note: 'Fix the terms' })
    expect(result).toMatchObject({ ok: true, state: { status: 'changes_requested', step: 0, approvals: [] } })
    expect(result.ok && result.events).toEqual([{ action: 'changes_requested', note: 'Fix the terms', step: 'Legal review' }])
  })

  it('a reviewer outside the step cannot withdraw; the requester can', () => {
    expect(run(inReview(1), 'withdraw', actor(4, ['editor']))).toMatchObject({ ok: false, status: 403 })
    expect(run(inReview(1), 'withdraw', actor(3, ['editor'], { can: { submit: true, comment: true, review: false, publish: false } }))).toMatchObject({ ok: true })
    expect(run(inReview(1), 'withdraw', actor(5, ['legal']))).toMatchObject({ ok: true })
  })

  it('a step beyond the workflow (it was shortened mid-review) is treated as the last step', () => {
    expect(run(inReview(9), 'approve', actor(5, ['legal']))).toMatchObject({ ok: true, state: { step: 1 } })
  })

  it('without a workflow nothing changes: no step on events, no role check', () => {
    const result = transition({ state: { status: 'in_review', requestedBy: 3, approvals: [] }, action: 'approve', actor: actor(4, []), required: 1, allowSelfApproval: false, now: NOW })
    expect(result).toMatchObject({ ok: true, state: { status: 'approved' } })
    expect(result.ok && result.events).toEqual([{ action: 'approved', note: null }])
    expect(result.ok && 'step' in result.state).toBe(false)
  })

  it('editing content restarts the workflow from step 0', () => {
    expect(resetOnEdit(inReview(1, [{ userId: 5, name: 'a', at: NOW }]), true)).toMatchObject({ status: 'in_review', step: 0, approvals: [] })
    expect(resetOnEdit({ status: 'approved', requestedBy: 3, approvals: [], step: 1 })).toMatchObject({ status: 'in_review', step: 0 })
    expect(resetOnEdit({ status: 'approved', requestedBy: 3, approvals: [] })).not.toHaveProperty('step')
  })
})

describe('workflow separation of duties', () => {
  it('a non-admin who approved an earlier step may not approve a later one; admins still may', () => {
    expect(run(inReview(1), 'approve', actor(5, ['legal']), { priorApprovers: [5] })).toMatchObject({
      ok: false,
      status: 403,
      error: 'You already approved an earlier step.',
    })
    // Someone who did not approve the earlier step may approve the later one.
    expect(run(inReview(1), 'approve', actor(6, ['legal']), { priorApprovers: [5] })).toMatchObject({ ok: true })
    // Admins are exempt.
    expect(run(inReview(1), 'approve', actor(1, ['admin'], { isAdmin: true }), { priorApprovers: [1] })).toMatchObject({ ok: true })
  })

  it('the earlier-step rule does not apply without a workflow', () => {
    const plain = transition({ state: inReview(0), action: 'approve', actor: actor(5, ['legal']), required: 2, allowSelfApproval: false, now: NOW, priorApprovers: [5] })
    expect(plain).toMatchObject({ ok: true })
  })
})

describe('workflow rules', () => {
  it('an active workflow replaces the global count, and describes what is awaited', () => {
    expect(requiredApprovalsFor(ON, 'pages')).toBe(1)
    expect(requiredApprovalsFor(ON, 'posts')).toBe(1)
    expect(activeWorkflowFor(ON, 'pages')).toBe(FLOW)
    expect(activeWorkflowFor(ON, 'posts')).toBeNull()
    expect(activeWorkflowFor({ ...ON, enabled: false }, 'pages')).toBeNull()
    expect(describeAwaiting(FLOW, 1)).toBe('Step 2 of 2 (Legal review), waiting on Legal.')
  })

  it('the publish gate is step-aware', () => {
    const message = publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'in_review', reviewStep: 1, isAdmin: false })
    expect(message).toContain('needs approval')
    expect(message).toContain('Step 2 of 2 (Legal review)')
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'none', isAdmin: false })).toContain('Editorial then legal')
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'approved', isAdmin: false })).toBeNull()
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'in_review', isAdmin: true })).toBeNull()
  })

  it('a content type with a workflow is gated even when its global count is 0', () => {
    expect(ON.requiredApprovals.pages).toBe(0)
    expect(publishBlockMessage({ settings: ON, collection: 'pages', reviewStatus: 'none', isAdmin: false })).not.toBeNull()
    expect(publishBlockMessage({ settings: { ...ON, workflows: {} }, collection: 'pages', reviewStatus: 'none', isAdmin: false })).toBeNull()
  })

  it('parses stored workflows defensively', () => {
    const parsed = parseWorkflow(
      { id: 3, name: ' Flow ', collection: 'posts', active: 1, submitterRoles: '["writer"]', steps: [{ name: ' A ', approverRoles: ['editor', 'editor', 5], approvalsNeeded: '2' }, { name: '', approverRoles: '[]', approvalsNeeded: 0 }] },
      new Map([['editor', 'Editors']]),
    )
    expect(parsed).toMatchObject({
      id: 3,
      name: 'Flow',
      active: true,
      submitterRoles: ['writer'],
      steps: [
        { name: 'A', approverRoles: ['editor'], approverNames: ['Editors'], approvalsNeeded: 2 },
        { name: 'Step 2', approverRoles: [], approvalsNeeded: 1 },
      ],
    })
    expect(parseWorkflow({ id: 3, collection: 'media', steps: [{ name: 'a' }] })).toBeNull()
    expect(parseWorkflow({ id: 3, collection: 'posts', steps: [] })).toBeNull()
  })

  it('validates a workflow: name, steps, roles, approvals, and one active per content type', () => {
    const known = new Set(['admin', 'editor', 'legal'])
    const good = { name: 'Flow', collection: 'pages', active: true, submitterRoles: ['editor'], steps: [{ name: 'A', approverRoles: ['legal'], approvalsNeeded: 1 }] }
    expect(validateWorkflowInput(good, known)).toEqual([])

    const messages = (input: Record<string, unknown>, others: Array<{ id: number; collection: string }> = [], self?: number) =>
      validateWorkflowInput({ ...good, ...input }, known, others, self).map((problem) => problem.message)

    expect(messages({ name: '  ' })).toContain('Give the workflow a name.')
    expect(messages({ collection: 'media' })[0]).toContain('Choose a content type')
    expect(messages({ steps: [] })).toContain('Add at least one step.')
    expect(messages({ steps: [{ name: '', approverRoles: ['legal'], approvalsNeeded: 1 }] })).toContain('Step 1 needs a name.')
    expect(messages({ steps: [{ name: 'A', approverRoles: [], approvalsNeeded: 1 }] })).toContain('Step 1 needs at least one approver role.')
    expect(messages({ steps: [{ name: 'A', approverRoles: ['ghost'], approvalsNeeded: 1 }] }).join(' ')).toContain('"ghost" does not exist')
    expect(messages({ submitterRoles: ['ghost'] }).join(' ')).toContain('"ghost" does not exist')
    expect(messages({ steps: [{ name: 'A', approverRoles: ['legal'], approvalsNeeded: 0 }] }).join(' ')).toContain('approvals needed')
    expect(messages({ steps: [{ name: 'A', approverRoles: ['legal'], approvalsNeeded: 1.5 }] }).join(' ')).toContain('approvals needed')
    expect(messages({}, [{ id: 9, collection: 'pages' }]).join(' ')).toContain('already active')
    expect(messages({}, [{ id: 9, collection: 'pages' }], 9)).toEqual([])
    expect(messages({ active: false }, [{ id: 9, collection: 'pages' }])).toEqual([])
    expect(messages({}, [{ id: 9, collection: 'posts' }])).toEqual([])
  })
})

describe('loading workflows fails closed', () => {
  beforeEach(() => {
    resetApprovalSettingsCacheForTests()
    resetWorkflowCacheForTests()
  })

  const doc = (id: number, collection: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Flow ${id}`,
    collection,
    active: true,
    steps: [{ name: 'A', approverRoles: ['editor'], approvalsNeeded: 1 }],
    ...extra,
  })

  const engineWith = (find: (args: Record<string, any>) => Promise<{ docs: any[] }>, enabled = true) => ({
    findGlobal: async () => ({ approval: { enabled, pagesApprovals: 0 } }),
    find: vi.fn(find),
  })

  it('attaches the active workflows to the settings', async () => {
    const engine = engineWith(async (args) => (args.collection === 'approval-workflows' ? { docs: [doc(1, 'pages'), doc(2, 'posts')] } : { docs: [{ slug: 'editor', name: 'Editors' }] }))
    const settings = await loadApprovalSettings(engine)
    expect(settings.workflows?.pages?.steps[0].approverNames).toEqual(['Editors'])
    expect(settings.workflows?.posts?.id).toBe(2)
    expect(settings.unknown).toBeUndefined()
  })

  it('does not query workflows while approval is off', async () => {
    const engine = engineWith(async () => ({ docs: [] }), false)
    const settings = await loadApprovalSettings(engine)
    expect(settings.enabled).toBe(false)
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('an unreadable workflows table with no earlier copy flags the settings unknown (non-admins blocked)', async () => {
    const engine = engineWith(async () => {
      throw new Error('boom')
    })
    const settings = await loadApprovalSettings(engine)
    expect(settings.unknown).toBe(true)
    expect(publishBlockMessage({ settings, collection: 'pages', reviewStatus: 'approved', isAdmin: false })).toBe(SETTINGS_UNAVAILABLE_MESSAGE)
  })

  it('after a good read, a failed read keeps the last good workflows', async () => {
    let fail = false
    const engine = engineWith(async (args) => {
      if (fail) throw new Error('down')
      return args.collection === 'approval-workflows' ? { docs: [doc(1, 'pages')] } : { docs: [] }
    })
    await loadApprovalSettings(engine)
    fail = true
    const settings = await loadApprovalSettings(engine)
    expect(settings.unknown).toBeUndefined()
    expect(settings.workflows?.pages?.id).toBe(1)
  })

  it('an active workflow with no steps is not silently ignored', async () => {
    const engine = { find: vi.fn(async (args: Record<string, any>) => (args.collection === 'approval-workflows' ? { docs: [doc(1, 'pages', { steps: [] })] } : { docs: [] })) }
    expect(await loadActiveWorkflows(engine)).toEqual({ workflows: {}, unknown: true })
  })

  it('the lowest id wins when two are active for one content type', async () => {
    const engine = { find: vi.fn(async (args: Record<string, any>) => (args.collection === 'approval-workflows' ? { docs: [doc(4, 'pages'), doc(9, 'pages')] } : { docs: [] })) }
    expect((await loadActiveWorkflows(engine)).workflows.pages?.id).toBe(4)
  })
})

describe('publish guard with a workflow', () => {
  const editor = { id: 2, roles: ['editor'] }
  const engine = { findGlobal: async () => ({ approval: { enabled: true, pagesApprovals: 0 } }), find: async (args: Record<string, any>) => (args.collection === 'approval-workflows' ? { docs: [{ id: 7, name: 'F', collection: 'pages', active: true, steps: [{ name: 'Legal review', approverRoles: ['legal'], approvalsNeeded: 1 }] }] } : { docs: [] }) }
  const guard = (data: Record<string, any>, originalDoc: Record<string, any>) =>
    publishGuard({ data, originalDoc, req: { user: editor, engine }, operation: 'update', collection: { slug: 'pages' } } as never)

  beforeEach(() => {
    resetApprovalSettingsCacheForTests()
    resetWorkflowCacheForTests()
  })

  it('an editor cannot publish a page in review, and the message names the step', async () => {
    const data = { _status: 'published' }
    await expect(guard(data, { _status: 'draft', reviewStatus: 'in_review', reviewStep: 0 })).rejects.toMatchObject({})
    await expect(guard({ _status: 'published' }, { _status: 'draft', reviewStatus: 'in_review', reviewStep: 0 })).rejects.toThrow(/Step 1 of 1 \(Legal review\)/)
  })

  it('the step is server-owned: a client cannot move a document along', async () => {
    const data: Record<string, any> = { title: 'x', reviewStep: 5, reviewStatus: 'approved' }
    await guard(data, { _status: 'draft', reviewStatus: 'in_review', reviewStep: 0, title: 'x' })
    expect(data.reviewStatus).toBe('in_review')
    expect(data.reviewStep).toBe(0)
  })

  it('editing the content of a document in review sends it back to step 0', async () => {
    const data: Record<string, any> = { title: 'changed' }
    await guard(data, { _status: 'draft', reviewStatus: 'in_review', reviewStep: 1, title: 'x', reviewApprovals: { hash: 'old', approvals: [{ userId: 9, name: 'n', at: NOW }] } })
    expect(data.reviewStatus).toBe('in_review')
    expect(data.reviewStep).toBe(0)
  })

  it('create starts at step 0', async () => {
    const data: Record<string, any> = { reviewStep: 3 }
    await publishGuard({ data, req: { user: editor, engine }, operation: 'create', collection: { slug: 'pages' } } as never)
    expect(data.reviewStep).toBe(0)
  })

  it('the review step field is hidden and read-only', () => {
    expect(reviewFields.find((field) => 'name' in field && field.name === 'reviewStep')).toMatchObject({ type: 'number', admin: { hidden: true, readOnly: true } })
  })
})

describe('workflow review handlers', () => {
  type Doc = Record<string, any>
  const users: Doc[] = [
    { id: 1, name: 'Ada Admin', email: 'ada@example.com', roles: ['admin'] },
    { id: 2, name: 'Ed Editor', email: 'ed@example.com', roles: ['editor'] },
    { id: 4, name: 'Eve Editor', email: 'eve@example.com', roles: ['editor'], permissionOverrides: { grant: { review: { publish: true } } } },
    { id: 5, name: 'Lee Legal', email: 'lee@example.com', roles: ['viewer'], customRole: 20 },
    { id: 6, name: 'Lou Legal', email: 'lou@example.com', roles: ['viewer'], customRole: 20 },
    { id: 8, name: 'Nia Nobody', email: 'nia@example.com', roles: ['viewer'] },
  ]
  const customRoles: Doc[] = [
    { id: 20, slug: 'legal', name: 'Legal', permissions: { pages: { read: true, update: true, publish: true }, review: { read: true, update: true, publish: true } } },
  ]
  const workflowDoc = { id: 7, name: 'Editorial then legal', collection: 'pages', active: true, steps: FLOW.steps.map((step) => ({ name: step.name, approverRoles: step.approverRoles, approvalsNeeded: step.approvalsNeeded })) }

  const makeEngine = (page: Doc) => {
    const state = { page }
    const updates: Doc[] = []
    const creates: Doc[] = []
    const engine = {
      state,
      updates,
      creates,
      find: vi.fn(async (args: Doc) => {
        if (args.collection === 'users') return { docs: users }
        if (args.collection === 'roles') return { docs: customRoles }
        if (args.collection === 'approval-workflows') return { docs: [workflowDoc] }
        if (args.collection === 'pages') return { docs: [state.page] }
        return { docs: [] }
      }),
      findByID: vi.fn(async (args: Doc) => {
        if (args.collection === 'users') return users.find((user) => user.id === args.id) ?? null
        if (args.collection === 'roles') return customRoles.find((role) => role.id === args.id) ?? null
        if (args.collection === 'pages') return state.page
        return null
      }),
      update: vi.fn(async (args: Doc) => {
        updates.push(args)
        state.page = { ...state.page, ...args.data, updatedAt: `t${updates.length}` }
        return {}
      }),
      create: vi.fn(async (args: Doc) => {
        creates.push(args)
        return {}
      }),
      findGlobal: vi.fn(async () => ({ approval: { enabled: true, pagesApprovals: 0, allowSelfApproval: false, notifyReviewers: true } })),
    }
    return engine
  }

  /** Permissions as the admin computes them: built-in roles, the custom role's matrix, overrides. */
  const viewerFor = (user: Doc): ReviewViewer => {
    const matrix = customRoles.find((role) => role.id === user.customRole)?.permissions
    return { id: user.id, name: user.name, isAdmin: user.roles.includes('admin'), can: (resource, action) => can(user as never, resource, action, matrix) }
  }
  const user = (id: number) => users.find((candidate) => candidate.id === id) as Doc
  const page = (extra: Doc = {}): Doc => ({ id: 5, title: 'Terms', _status: 'draft', reviewStatus: 'none', reviewRequestedBy: null, reviewApprovals: [], updatedAt: 't0', ...extra })
  const post = (engine: ReturnType<typeof makeEngine>, who: number, body: Doc) =>
    handleReviewPost({ engine: engine as never, viewer: viewerFor(user(who)), origin: 'https://x.test', body: { collection: 'pages', id: 5, ...body }, now: NOW })
  const recipients = () => sendEmail.mock.calls.map((call) => (call as unknown as [{ to: string }])[0].to).sort()

  beforeEach(() => {
    sendEmail.mockClear()
    resetApprovalSettingsCacheForTests()
    resetWorkflowCacheForTests()
  })

  it('walks a page through both steps, resetting approvals per step, then publishes', async () => {
    const engine = makeEngine(page())

    // Ed submits: step 0, and only step 0's approvers (editors with review.publish, and admins) are emailed.
    expect(await post(engine, 2, { action: 'submit' })).toMatchObject({ status: 200, body: { status: 'in_review', step: 0 } })
    expect(engine.updates[0].data).toMatchObject({ reviewStatus: 'in_review', reviewStep: 0 })
    expect(engine.creates[0].data).toMatchObject({ action: 'submitted', step: 'Editor review' })
    expect(recipients()).toEqual(['ada@example.com', 'eve@example.com'])

    // A legal approver cannot approve step 1 (editor).
    const early = await post(engine, 5, { action: 'approve' })
    expect(early.status).toBe(403)
    expect(String(early.body.error)).toContain('Editor review')

    // Eve approves: the page moves to step 2, approvals cleared, and legal people are emailed.
    sendEmail.mockClear()
    expect(await post(engine, 4, { action: 'approve' })).toMatchObject({ status: 200, body: { status: 'in_review', step: 1, approvals: [] } })
    expect(engine.state.page).toMatchObject({ reviewStatus: 'in_review', reviewStep: 1 })
    expect(engine.creates[1].data).toMatchObject({ action: 'approved', step: 'Editor review' })
    expect(recipients()).toEqual(['ada@example.com', 'lee@example.com', 'lou@example.com'])

    // Step 2 needs two legal approvals. Editors can no longer approve.
    expect((await post(engine, 4, { action: 'approve' })).status).toBe(403)
    expect(await post(engine, 5, { action: 'approve' })).toMatchObject({ status: 200, body: { status: 'in_review', step: 1 } })
    expect((await post(engine, 5, { action: 'approve' })).status).toBe(409)
    expect(await post(engine, 6, { action: 'approve' })).toMatchObject({ status: 200, body: { status: 'approved' } })
    expect(engine.state.page.reviewStatus).toBe('approved')

    // Publishing from review.
    expect(await post(engine, 1, { action: 'publish' })).toMatchObject({ status: 200, body: { published: true, status: 'none' } })
    expect(engine.state.page).toMatchObject({ _status: 'published', reviewStatus: 'none', reviewStep: 0 })
  })

  it('submit is refused for a role outside submitterRoles', async () => {
    const restricted = makeEngine(page())
    ;(workflowDoc as Doc).submitterRoles = ['legal']
    try {
      expect((await post(restricted, 2, { action: 'submit' })).status).toBe(403)
    } finally {
      delete (workflowDoc as Doc).submitterRoles
    }
  })

  it('request changes goes back to step 0', async () => {
    const engine = makeEngine(page({ reviewStatus: 'in_review', reviewRequestedBy: 2, reviewStep: 1 }))
    const result = await post(engine, 5, { action: 'request_changes', note: 'Clause 4' })
    expect(result.status).toBe(200)
    expect(engine.state.page).toMatchObject({ reviewStatus: 'changes_requested', reviewStep: 0 })
    expect(engine.creates[0].data).toMatchObject({ action: 'changes_requested', step: 'Legal review' })
  })

  it('GET says which step is awaited and what the viewer may do there', async () => {
    const engine = makeEngine(page({ reviewStatus: 'in_review', reviewRequestedBy: 2, reviewStep: 1 }))
    const asLegal = await handleReviewGet({ engine: engine as never, viewer: viewerFor(user(5)), collection: 'pages', id: 5, now: NOW })
    expect(asLegal.body).toMatchObject({
      requiredApprovals: 2,
      workflow: { name: 'Editorial then legal', stepCount: 2, step: { index: 1, name: 'Legal review', approvalsNeeded: 2, total: 2 } },
      allowed: { approve: true, requestChanges: true },
    })
    expect(String(asLegal.body.workflow && (asLegal.body.workflow as Doc).awaiting)).toContain('Step 2 of 2 (Legal review)')
    expect(String(asLegal.body.publishBlocked)).toContain('Step 2 of 2')

    const asEditor = await handleReviewGet({ engine: engine as never, viewer: viewerFor(user(4)), collection: 'pages', id: 5, now: NOW })
    expect(asEditor.body.allowed).toMatchObject({ approve: false, requestChanges: false })
    const asAdmin = await handleReviewGet({ engine: engine as never, viewer: viewerFor(user(1)), collection: 'pages', id: 5, now: NOW })
    expect(asAdmin.body.allowed).toMatchObject({ approve: true })
  })

  it('a person who approved an earlier step cannot approve a later one, read from the review history', async () => {
    const engine = makeEngine(page({ reviewStatus: 'in_review', reviewRequestedBy: 2, reviewStep: 1 }))
    const base = engine.find.getMockImplementation() as (args: Doc) => Promise<{ docs: Doc[] }>
    // Newest first: Eve approved step 1 (Editor review) this round, after the submit.
    const history = [
      { id: 12, action: 'approved', actor: 4, step: 'Editor review', createdAt: 't2' },
      { id: 11, action: 'submitted', actor: 2, step: 'Editor review', createdAt: 't1' },
    ]
    engine.find.mockImplementation(async (args: Doc) => (args.collection === 'review-events' ? { docs: history } : base(args)))

    // Let editors act on the later step too, so Eve's only obstacle is the earlier approval.
    const original = [...(workflowDoc.steps[1].approverRoles as string[])]
    workflowDoc.steps[1].approverRoles = ['legal', 'editor']
    try {
      expect(await post(engine, 4, { action: 'approve' })).toMatchObject({ status: 403, body: { error: 'You already approved an earlier step.' } })
      const asEve = await handleReviewGet({ engine: engine as never, viewer: viewerFor(user(4)), collection: 'pages', id: 5, now: NOW })
      expect(asEve.body.allowed).toMatchObject({ approve: false })
      // An admin is not held back by the earlier approval.
      expect((await post(engine, 1, { action: 'approve' })).status).toBe(200)
    } finally {
      workflowDoc.steps[1].approverRoles = original
    }
  })

  it('a workflow that cannot be read refuses review steps (503) rather than guessing', async () => {
    const engine = makeEngine(page({ reviewStatus: 'in_review', reviewRequestedBy: 2 }))
    engine.find.mockImplementation(async (args: Doc) => {
      if (args.collection === 'approval-workflows') throw new Error('down')
      return { docs: [] }
    })
    const result = await post(engine, 1, { action: 'approve' })
    expect(result.status).toBe(503)
    expect(engine.updates).toHaveLength(0)
  })

  it('the queue shows reviewers only what waits on their step, and submitters their own', async () => {
    const waiting = (id: number, step: number, by: number) => ({ id, title: `Doc ${id}`, reviewStatus: 'in_review', reviewStep: step, reviewRequestedBy: { id: by, name: 'x' }, reviewRequestedAt: NOW })
    const engine = makeEngine(page())
    engine.find.mockImplementation(async (args: Doc) => {
      if (args.collection === 'pages') return { docs: [waiting(1, 0, 2), waiting(2, 1, 2), waiting(3, 1, 4)] }
      if (args.collection === 'approval-workflows') return { docs: [workflowDoc] }
      return { docs: [] }
    })
    const settings = await loadApprovalSettings(engine)
    const forLegal = await loadReviewQueue({ engine: engine as never, viewer: viewerFor(user(5)), settings })
    expect(forLegal.map((row) => row.id).sort()).toEqual([2, 3])
    expect(forLegal[0].awaiting).toContain('Legal review')
    const forEditor = await loadReviewQueue({ engine: engine as never, viewer: viewerFor(user(4)), settings })
    expect(forEditor.map((row) => row.id).sort()).toEqual([1, 3])
    const forAdmin = await loadReviewQueue({ engine: engine as never, viewer: viewerFor(user(1)), settings })
    expect(forAdmin).toHaveLength(3)
  })

  describe('who is emailed', () => {
    beforeEach(() => {
      resetWorkflowCacheForTests()
    })

    it('includes reviewers who hold review rights through a custom role (the old lookup never loaded it)', async () => {
      const engine = makeEngine(page())
      const all = await reviewerAddresses(engine as never, 'pages', null)
      expect(all).toEqual(expect.arrayContaining(['lee@example.com', 'lou@example.com', 'eve@example.com', 'ada@example.com']))
      expect(all).not.toContain('ed@example.com')
      expect(all).not.toContain('nia@example.com')
    })

    it('targets a step\'s roles: custom role by slug, built-in role by name, admins always', async () => {
      const engine = makeEngine(page())
      expect((await reviewerAddresses(engine as never, 'pages', null, ['legal'])).sort()).toEqual(['ada@example.com', 'lee@example.com', 'lou@example.com'])
      expect((await reviewerAddresses(engine as never, 'pages', null, ['editor'])).sort()).toEqual(['ada@example.com', 'eve@example.com'])
      expect((await reviewerAddresses(engine as never, 'pages', 5, ['legal'])).sort()).toEqual(['ada@example.com', 'lou@example.com'])
    })

    it('a listed role without review.publish in its matrix is not emailed (it could not approve anyway)', async () => {
      const engine = makeEngine(page())
      customRoles[0].permissions = { pages: { read: true } }
      try {
        expect(await reviewerAddresses(engine as never, 'pages', null, ['legal'])).toEqual(['ada@example.com'])
      } finally {
        customRoles[0].permissions = { pages: { read: true, update: true, publish: true }, review: { read: true, update: true, publish: true } }
      }
    })

    it('resolves a user\'s slugs from built-in and custom roles, and gives none when the read fails', async () => {
      const engine = makeEngine(page())
      expect((await roleSlugsOfUser(engine as never, 5)).sort()).toEqual(['legal', 'viewer'])
      expect(await roleSlugsOfUser(engine as never, 999)).toEqual([])
      expect(await roleSlugsOfUser({ findByID: async () => { throw new Error('x') } } as never, 5)).toEqual([])
    })
  })
})

describe('approval-workflows collection', () => {
  const admin = { id: 1, roles: ['admin'] }
  const editor = { id: 2, roles: ['editor'] }
  const viewer = { id: 3, roles: ['viewer'] }
  const customer = { id: 4, roles: ['customer'] }
  const access = (name: 'create' | 'read' | 'update' | 'delete', user: unknown) =>
    (ApprovalWorkflows.access?.[name] as unknown as (args: { req: { user: unknown } }) => boolean)({ req: { user } })

  it('only admins write; only people who can read the review queue read; the public never reads', () => {
    for (const name of ['create', 'update', 'delete'] as const) {
      expect(access(name, admin), name).toBe(true)
      expect(access(name, editor), name).toBe(false)
      expect(access(name, viewer), name).toBe(false)
      expect(access(name, null), name).toBe(false)
    }
    expect(access('read', admin)).toBe(true)
    expect(access('read', editor)).toBe(true)
    expect(access('read', viewer)).toBe(true)
    expect(access('read', customer)).toBe(false)
    expect(access('read', null)).toBe(false)
  })

  it('is hidden from the nav and has no public-readable path', () => {
    expect(ApprovalWorkflows.admin?.hidden).toBe(true)
    expect(ApprovalWorkflows.slug).toBe('approval-workflows')
  })

  const hookArgs = (data: Record<string, unknown>, operation: 'create' | 'update', others: Array<Record<string, unknown>> = [], originalDoc?: Record<string, unknown>) => ({
    data,
    originalDoc,
    operation,
    req: {
      user: admin,
      engine: {
        find: async (args: Record<string, any>) => {
          if (args.collection === 'roles') return { docs: [{ slug: 'admin' }, { slug: 'editor' }, { slug: 'legal' }] }
          return { docs: others }
        },
      },
    },
  })
  const good = { name: 'Flow', collection: 'pages', active: true, steps: [{ name: 'A', approverRoles: ['editor'], approvalsNeeded: 1 }] }

  it('the save hook accepts a good workflow and rejects bad ones before they are stored', async () => {
    await expect(validateWorkflowBeforeChange(hookArgs(good, 'create') as never)).resolves.toBeUndefined()
    await expect(validateWorkflowBeforeChange(hookArgs({ ...good, steps: [] }, 'create') as never)).rejects.toThrow()
    await expect(validateWorkflowBeforeChange(hookArgs({ ...good, steps: [{ name: 'A', approverRoles: ['ghost'], approvalsNeeded: 1 }] }, 'create') as never)).rejects.toThrow()
    await expect(validateWorkflowBeforeChange(hookArgs(good, 'create', [{ id: 9, collection: 'pages' }]) as never)).rejects.toThrow()
  })

  it('an update that only toggles active is validated against the stored workflow', async () => {
    const stored = { id: 9, ...good, active: false }
    await expect(validateWorkflowBeforeChange(hookArgs({ active: true }, 'update', [], stored) as never)).resolves.toBeUndefined()
    await expect(validateWorkflowBeforeChange(hookArgs({ active: true }, 'update', [{ id: 10, collection: 'pages' }], stored) as never)).rejects.toThrow()
    // Saving the workflow that is itself the active one is not a clash with itself.
    await expect(validateWorkflowBeforeChange(hookArgs({ name: 'Renamed' }, 'update', [{ id: 9, collection: 'pages' }], { ...stored, active: true }) as never)).resolves.toBeUndefined()
  })

  it('system writes without a user are not validated (seed scripts)', async () => {
    await expect(validateWorkflowBeforeChange({ data: {}, operation: 'create', req: {} } as never)).resolves.toBeUndefined()
  })
})
