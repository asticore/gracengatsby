// @vitest-environment node
/**
 * The Approval workflows tab on the Roles page: the pure form helpers, and a server render of the
 * panel to check what is on screen by default (every saved workflow collapsed, the off-switch notice).
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ApprovalWorkflowsPanel } from '@/admin/views/ApprovalWorkflowsPanel'
import { RolesViewClient } from '@/admin/views/RolesViewClient'
import {
  draftFromRecord,
  emptyDraft,
  errorMessageFrom,
  moveStep,
  payloadFromDraft,
  roleChoices,
  toggleRole,
  unwrapDoc,
  validateDraft,
} from '@/features/approval/workflowForm'

const record = {
  id: 4,
  name: 'Editorial then legal',
  collection: 'pages',
  active: true,
  submitterRoles: ['editor'],
  steps: [
    { id: 'a', name: 'Editor review', approverRoles: ['editor'], approvalsNeeded: 1 },
    { id: 'b', name: 'Legal review', approverRoles: ['legal'], approvalsNeeded: 2 },
  ],
}

const roles = [
  { id: 20, name: 'Legal', slug: 'legal', builtIn: false, permissions: { review: { read: true, update: true, publish: true } } },
  { id: 21, name: 'Interns', slug: 'interns', builtIn: false, permissions: { pages: { read: true } } },
]

describe('workflow form helpers', () => {
  it('round-trips a stored workflow into a draft and back into a clean payload', () => {
    const draft = draftFromRecord(record)
    expect(draft).toMatchObject({ id: 4, collection: 'pages', active: true, submitterRoles: ['editor'] })
    expect(draft.steps.map((step) => step.key)).toEqual(['a', 'b'])
    const payload = payloadFromDraft({ ...draft, name: '  Flow  ', steps: draft.steps.map((step) => ({ ...step, name: ` ${step.name} ` })) })
    expect(payload).toEqual({
      name: 'Flow',
      collection: 'pages',
      active: true,
      submitterRoles: ['editor'],
      steps: [
        { name: 'Editor review', approverRoles: ['editor'], approvalsNeeded: 1 },
        { name: 'Legal review', approverRoles: ['legal'], approvalsNeeded: 2 },
      ],
    })
  })

  it('moves, adds and toggles', () => {
    const steps = draftFromRecord(record).steps
    expect(moveStep(steps, 0, 1).map((step) => step.name)).toEqual(['Legal review', 'Editor review'])
    expect(moveStep(steps, 0, 5)).toBe(steps)
    expect(toggleRole(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleRole(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('validates with the same rules as the server', () => {
    const known = ['admin', 'editor', 'legal']
    expect(validateDraft(draftFromRecord(record), known, [{ id: 4, collection: 'pages', active: true }])).toEqual([])
    expect(validateDraft(emptyDraft(), known, [])).toEqual(expect.arrayContaining(['Give the workflow a name.', 'Step 1 needs a name.', 'Step 1 needs at least one approver role.']))
    const clash = validateDraft({ ...draftFromRecord(record), id: null }, known, [{ id: 9, collection: 'pages', active: true }])
    expect(clash.join(' ')).toContain('already active')
    expect(validateDraft({ ...draftFromRecord(record), id: null, active: false }, known, [{ id: 9, collection: 'pages', active: true }])).toEqual([])
  })

  it('offers built-in and custom roles (not admin) and flags roles that could not approve', () => {
    const choices = roleChoices(roles)
    expect(choices.map((choice) => choice.slug)).toEqual(expect.arrayContaining(['editor', 'viewer', 'customer', 'legal', 'interns']))
    expect(choices.map((choice) => choice.slug)).not.toContain('admin')
    const bySlug = Object.fromEntries(choices.map((choice) => [choice.slug, choice]))
    expect(bySlug.legal.canApprove).toBe(true)
    expect(bySlug.interns.canApprove).toBe(false)
    expect(bySlug.editor.canApprove).toBe(false)
  })

  it('reads REST answers', () => {
    expect(unwrapDoc<{ id: number }>({ doc: { id: 3 }, message: 'ok' })).toEqual({ id: 3 })
    expect(unwrapDoc<{ id: number }>({ id: 3 })).toEqual({ id: 3 })
    expect(unwrapDoc({ errors: [] })).toBeNull()
    expect(errorMessageFrom({ errors: [{ message: 'The following field is invalid', data: { errors: [{ message: 'Add at least one step.' }] } }] }, 'x')).toBe('Add at least one step.')
    expect(errorMessageFrom({ errors: [{ message: 'Forbidden' }] }, 'x')).toBe('Forbidden')
    expect(errorMessageFrom({ message: 'nope' }, 'x')).toBe('nope')
    expect(errorMessageFrom(null, 'fallback')).toBe('fallback')
  })
})

describe('Approval workflows panel', () => {
  const render = (props: Partial<React.ComponentProps<typeof ApprovalWorkflowsPanel>> = {}) =>
    renderToStaticMarkup(React.createElement(ApprovalWorkflowsPanel, { workflows: [record], roles, canEdit: true, approvalEnabled: true, ...props }))

  it('lists each workflow in a collapsed card', () => {
    const html = render()
    expect(html).toContain('Editorial then legal - Pages')
    expect(html).toContain('ec-card--closed')
    expect(html).not.toContain('ec-card--open')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('+ New workflow')
  })

  it('marks an inactive workflow and says so when approval is off', () => {
    const html = render({ workflows: [{ ...record, active: false }], approvalEnabled: false })
    expect(html).toContain('(off)')
    expect(html).toContain('Content approval is switched off')
  })

  it('shows the form fields: name, content type, submitters, steps with roles and counts, reorder and remove', () => {
    const html = render()
    for (const text of ['Who can submit', 'Who can approve this step', 'Approvals needed', 'Content type', 'Step name', 'Move step 2 up', 'Remove step 1', '+ Add step', 'Save workflow']) {
      expect(html).toContain(text)
    }
  })

  it('hides the controls from someone who cannot edit', () => {
    const html = render({ canEdit: false })
    expect(html).not.toContain('+ New workflow')
    expect(html).not.toContain('Save workflow')
  })

  it('warns when a chosen approver role lacks the review permission', () => {
    const html = render({ workflows: [{ ...record, steps: [{ id: 'a', name: 'S', approverRoles: ['interns'], approvalsNeeded: 1 }] }] })
    expect(html).toContain('Interns does not have the Review: publish permission yet')
  })

  it('the Roles page has the permissions tab selected first, with the workflows tab beside it', () => {
    const html = renderToStaticMarkup(React.createElement(RolesViewClient, { roles: [], canEdit: true, workflows: [record], approvalEnabled: true }))
    expect(html).toContain('Approval workflows')
    expect(html).toContain('id="roles-tab-permissions" aria-selected="true"')
    expect(html).toContain('id="roles-tab-workflows" aria-selected="false"')
    expect(html).not.toContain('Editorial then legal')
  })
})
