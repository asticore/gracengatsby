/**
 * The Roles page's workflow editor, minus the React: the draft shape, turning stored documents
 * into drafts and drafts into REST payloads, step moves, the role choices, and reading REST
 * answers. Client-safe (no engine or database imports) so it can be tested on its own.
 */

import {
  APPROVAL_COLLECTIONS,
  BUILT_IN_ROLE_SLUGS,
  MAX_WORKFLOW_STEPS,
  parseRoleList,
  validateWorkflowInput,
  type ApprovalCollection,
} from './workflows'
import { BUILT_IN_ROLES, type PermissionMatrix } from '@/features/roles/permissions'

export const COLLECTION_LABELS: Record<ApprovalCollection, string> = {
  pages: 'Pages',
  posts: 'Posts',
  events: 'Events',
  courses: 'Courses',
  products: 'Products',
}

export type DraftStep = { key: string; name: string; approverRoles: string[]; approvalsNeeded: number }

export type WorkflowDraft = {
  id: number | null
  name: string
  collection: ApprovalCollection
  active: boolean
  submitterRoles: string[]
  steps: DraftStep[]
}

/** A workflow as the REST API returns it. */
export type WorkflowRecord = {
  id: number
  name?: string
  collection?: string
  active?: boolean | null
  submitterRoles?: unknown
  steps?: Array<{ id?: string; name?: string | null; approverRoles?: unknown; approvalsNeeded?: number | null }> | null
}

export type RoleChoice = { slug: string; name: string; builtIn: boolean; canApprove: boolean }

let counter = 0
export const newStepKey = (): string => `step-${Date.now().toString(36)}-${(counter += 1)}`

export const emptyStep = (): DraftStep => ({ key: newStepKey(), name: '', approverRoles: [], approvalsNeeded: 1 })

export const emptyDraft = (collection: ApprovalCollection = 'pages'): WorkflowDraft => ({
  id: null,
  name: '',
  collection,
  active: false,
  submitterRoles: [],
  steps: [emptyStep()],
})

export function draftFromRecord(record: WorkflowRecord): WorkflowDraft {
  const collection = APPROVAL_COLLECTIONS.find((value) => value === record.collection) ?? 'pages'
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : '',
    collection,
    active: record.active === true,
    submitterRoles: parseRoleList(record.submitterRoles),
    steps: (record.steps ?? []).map((step) => ({
      key: step.id || newStepKey(),
      name: typeof step.name === 'string' ? step.name : '',
      approverRoles: parseRoleList(step.approverRoles),
      approvalsNeeded: Number.isFinite(Number(step.approvalsNeeded)) ? Number(step.approvalsNeeded) : 1,
    })),
  }
}

/** The body sent to /api/approval-workflows. Text is trimmed; step keys stay in the browser. */
export function payloadFromDraft(draft: WorkflowDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    collection: draft.collection,
    active: draft.active,
    submitterRoles: draft.submitterRoles,
    steps: draft.steps.map((step) => ({
      name: step.name.trim(),
      approverRoles: step.approverRoles,
      approvalsNeeded: step.approvalsNeeded,
    })),
  }
}

/** Messages for the form, from the same rules the server applies. Empty means it can be saved. */
export function validateDraft(draft: WorkflowDraft, knownRoles: Iterable<string>, others: ReadonlyArray<{ id: number; collection: string; active: boolean }>): string[] {
  const problems = validateWorkflowInput(
    payloadFromDraft(draft),
    new Set(knownRoles),
    others.filter((other) => other.active),
    draft.id,
  )
  return problems.map((problem) => problem.message)
}

export function moveStep(steps: DraftStep[], from: number, to: number): DraftStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export const canAddStep = (steps: DraftStep[]): boolean => steps.length < MAX_WORKFLOW_STEPS

/** Adds or removes a slug from a role list, keeping the order stable. */
export function toggleRole(roles: string[], slug: string): string[] {
  return roles.includes(slug) ? roles.filter((role) => role !== slug) : [...roles, slug]
}

const titleCase = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1)

type RoleRow = { slug: string; name?: string; builtIn?: boolean; permissions?: Partial<PermissionMatrix> | null }

/**
 * Every role a workflow can name: the built-in roles (admin is left out, it is always allowed)
 * and the roles on the Roles page. `canApprove` is false when the role's matrix lacks Review:
 * publish, so the editor can warn that it could not approve yet.
 */
export function roleChoices(roles: RoleRow[]): RoleChoice[] {
  const bySlug = new Map<string, RoleChoice>()
  for (const slug of BUILT_IN_ROLE_SLUGS) {
    if (slug === 'admin') continue
    bySlug.set(slug, { slug, name: titleCase(slug), builtIn: true, canApprove: Boolean(BUILT_IN_ROLES[slug]?.review?.publish) })
  }
  for (const role of roles) {
    if (!role.slug || role.slug === 'admin') continue
    const builtIn = BUILT_IN_ROLE_SLUGS.includes(role.slug)
    const matrix = builtIn ? BUILT_IN_ROLES[role.slug] : role.permissions
    bySlug.set(role.slug, {
      slug: role.slug,
      name: role.name || titleCase(role.slug),
      builtIn,
      canApprove: Boolean((matrix as Partial<PermissionMatrix> | null | undefined)?.review?.publish),
    })
  }
  return [...bySlug.values()]
}

/** The document out of a REST create/update answer (`{doc, message}`), or the body itself. */
export function unwrapDoc<T>(body: unknown): T | null {
  if (!body || typeof body !== 'object') return null
  const record = body as { doc?: unknown }
  if (record.doc && typeof record.doc === 'object') return record.doc as T
  return 'id' in record ? (body as T) : null
}

/** The most useful message in a REST error answer: field messages first, then the error, then `message`. */
export function errorMessageFrom(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const record = body as { errors?: Array<{ message?: string; data?: { errors?: Array<{ message?: string }> } }>; message?: string }
  const first = record.errors?.[0]
  const fieldMessages = (first?.data?.errors ?? []).map((error) => error.message).filter((message): message is string => Boolean(message))
  if (fieldMessages.length > 0) return fieldMessages.join(' ')
  return first?.message || record.message || fallback
}
