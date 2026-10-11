import type { CollectionConfig, CollectionBeforeChangeHook } from '@/engine'

import { isAdmin, roleAccess } from '@/access/ecommerceAccess'

import { APPROVAL_COLLECTIONS } from './settings'
import { BUILT_IN_ROLE_SLUGS, validateWorkflowInput, WORKFLOWS_SLUG } from './workflows'

/**
 * Checks a workflow before it is saved: a name, a content type, at least one step, every step
 * named with an approver role and a whole number of approvals, every role real, and no second
 * active workflow for the same content type. The REST write is already admin-only; this keeps a
 * bad flow from ever reaching the review engine, whatever the client sent.
 */
export const validateWorkflowBeforeChange: CollectionBeforeChangeHook = async (args: unknown) => {
  const { data, originalDoc, req, operation } = args as {
    data: Record<string, unknown>
    originalDoc?: Record<string, unknown>
    req?: { engine?: { find: (a: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }> }; user?: unknown }
    operation: string
  }
  // System writes (seed scripts) have no user and are trusted; user writes are validated.
  if (!req?.user || !req.engine) return

  const merged = { ...(operation === 'update' ? originalDoc : {}), ...data }
  const roles = await req.engine.find({ collection: 'roles', limit: 1000, depth: 0, overrideAccess: true })
  const known = new Set<string>([...BUILT_IN_ROLE_SLUGS, ...roles.docs.map((role) => String(role.slug ?? '')).filter(Boolean)])
  const active = await req.engine.find({
    collection: WORKFLOWS_SLUG,
    where: { active: { equals: true } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const selfId = operation === 'update' ? Number(originalDoc?.id) : null
  const problems = validateWorkflowInput(
    merged,
    known,
    active.docs.map((doc) => ({ id: Number(doc.id), collection: String(doc.collection) })),
    selfId,
  )
  if (problems.length > 0) {
    const { ValidationError } = await import('@/localapi/operations')
    throw new ValidationError(problems)
  }
}

/**
 * Named multi-step approval flows, one active per content type. Managed from the Roles page and
 * hidden from the nav; nothing here is public. Only admins may write, and only people who can
 * read the review queue may read (so the review panel can say who is being waited on).
 */
export const ApprovalWorkflows: CollectionConfig = {
  slug: WORKFLOWS_SLUG,
  dbName: 'eg_approval_workflows',
  labels: { singular: 'Approval workflow', plural: 'Approval workflows' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'collection', 'active'],
    group: 'Settings',
    hidden: true,
    description: 'Multi-step approval flows. Managed on the Roles page.',
  },
  access: {
    create: isAdmin,
    read: roleAccess('review', 'read'),
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { beforeChange: [validateWorkflowBeforeChange] },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'collection',
      type: 'select',
      required: true,
      options: APPROVAL_COLLECTIONS.map((value) => ({ label: value, value })),
    },
    { name: 'active', type: 'checkbox', defaultValue: false },
    {
      name: 'submitterRoles',
      type: 'json',
      admin: { description: 'Role slugs that may submit. Empty means anyone who can edit this content.' },
    },
    {
      name: 'steps',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'approverRoles', type: 'json', admin: { description: 'Role slugs that may approve this step. Admins always may.' } },
        { name: 'approvalsNeeded', type: 'number', required: true, defaultValue: 1, min: 1 },
      ],
    },
  ],
  defaultSort: 'name',
}
