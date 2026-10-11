/**
 * Approval workflows: named, multi-step review flows for one content type. Each step says which
 * roles approve it and how many approvals it needs; a workflow also says which roles may submit.
 *
 * Pure parsing and validation live here, plus the loader. A collection with an ACTIVE workflow
 * uses it instead of the global approvals count (see settings.ts); with none, nothing changes.
 *
 * Roles are referred to by slug: a built-in role (admin, editor, viewer, customer) or the slug of
 * a custom role on the Roles page. Admins are always allowed at every step and may always submit.
 */

import { BUILT_IN_ROLES } from '@/features/roles/permissions'

/** Built-in role slugs. These need no row on the Roles page, so they are always valid in a workflow. */
export const BUILT_IN_ROLE_SLUGS: string[] = Object.keys(BUILT_IN_ROLES)

const titleCase = (slug: string): string => slug.charAt(0).toUpperCase() + slug.slice(1)

/** The content types that can go through review. Defined here, re-exported from settings.ts. */
export const APPROVAL_COLLECTIONS = ['pages', 'posts', 'events', 'courses', 'products'] as const
export type ApprovalCollection = (typeof APPROVAL_COLLECTIONS)[number]

export const isApprovalCollection = (value: unknown): value is ApprovalCollection =>
  typeof value === 'string' && (APPROVAL_COLLECTIONS as readonly string[]).includes(value)

export const WORKFLOWS_SLUG = 'approval-workflows'
export const MAX_WORKFLOW_STEPS = 10
export const MAX_APPROVALS_PER_STEP = 10
export const MAX_NAME_LENGTH = 120

export type WorkflowStep = {
  name: string
  /** Role slugs that may approve this step. Admins always may. */
  approverRoles: string[]
  /** Display names for approverRoles, same order. Falls back to the slug. */
  approverNames: string[]
  approvalsNeeded: number
}

export type ApprovalWorkflow = {
  id: number
  name: string
  collection: ApprovalCollection
  active: boolean
  /** Empty means anyone who can edit this collection and has review.update may submit. */
  submitterRoles: string[]
  steps: WorkflowStep[]
}

/** What the state machine needs from a workflow. */
export type WorkflowRule = Pick<ApprovalWorkflow, 'steps' | 'submitterRoles'>

/** Shown to non-admins while the workflows cannot be read. */
export const WORKFLOWS_UNAVAILABLE_MESSAGE = 'Approval workflows could not be loaded; try again.'

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A json field may arrive as an array or as JSON text. Anything else reads as empty. */
export function parseRoleList(value: unknown): string[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const slug = entry.trim()
    if (slug) seen.add(slug)
  }
  return [...seen]
}

const toBool = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true'

/** Number of approvals a step needs: a whole number, at least one. */
export const clampApprovalsNeeded = (value: unknown): number => {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number) || number < 1) return 1
  return Math.min(MAX_APPROVALS_PER_STEP, number)
}

/** Turns a stored workflow document into a workflow, or null when it cannot be used (no steps, bad collection). */
export function parseWorkflow(doc: unknown, roleNames: ReadonlyMap<string, string> = new Map()): ApprovalWorkflow | null {
  if (!doc || typeof doc !== 'object') return null
  const row = doc as Record<string, unknown>
  const id = Number(row.id)
  if (!Number.isInteger(id) || id <= 0) return null
  if (!isApprovalCollection(row.collection)) return null
  const rawSteps = Array.isArray(row.steps) ? row.steps : []
  const steps: WorkflowStep[] = []
  for (const entry of rawSteps) {
    if (!entry || typeof entry !== 'object') continue
    const step = entry as Record<string, unknown>
    const approverRoles = parseRoleList(step.approverRoles)
    steps.push({
      name: asString(step.name).trim() || `Step ${steps.length + 1}`,
      approverRoles,
      approverNames: approverRoles.map((slug) => roleNames.get(slug) ?? slug),
      approvalsNeeded: clampApprovalsNeeded(step.approvalsNeeded),
    })
  }
  if (steps.length === 0) return null
  return {
    id,
    name: asString(row.name).trim() || `Workflow ${id}`,
    collection: row.collection,
    active: toBool(row.active),
    submitterRoles: parseRoleList(row.submitterRoles),
    steps,
  }
}

/** True when the user (by role slugs) may act at this step. Admins always may. */
export function mayActOnStep(step: WorkflowStep, roleSlugs: readonly string[], isAdmin: boolean): boolean {
  if (isAdmin) return true
  return step.approverRoles.some((slug) => roleSlugs.includes(slug))
}

/** True when the user may submit under this workflow. Admins always may; an empty list means anyone with edit rights. */
export function maySubmitUnder(workflow: WorkflowRule, roleSlugs: readonly string[], isAdmin: boolean): boolean {
  if (isAdmin || workflow.submitterRoles.length === 0) return true
  return workflow.submitterRoles.some((slug) => roleSlugs.includes(slug))
}

/** A stored step index, kept inside the workflow's steps (a workflow edited mid-review can shrink). */
export function clampStep(step: unknown, stepCount: number): number {
  const number = Math.floor(Number(step))
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.min(number, Math.max(0, stepCount - 1))
}

const listNames = (names: string[]): string => {
  if (names.length === 0) return 'an admin'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** "Step 2 of 3 (Legal review), waiting on Legal or Editor." Used wherever people are told what is awaited. */
export function describeAwaiting(workflow: WorkflowRule, step: number): string {
  const index = clampStep(step, workflow.steps.length)
  const current = workflow.steps[index]
  return `Step ${index + 1} of ${workflow.steps.length} (${current.name}), waiting on ${listNames(current.approverNames)}.`
}

export type WorkflowInput = {
  name?: unknown
  collection?: unknown
  active?: unknown
  submitterRoles?: unknown
  steps?: unknown
}

/**
 * Validates a workflow as saved from the Roles page. Returns one message per problem, empty when
 * fine. `knownRoles` are the slugs that exist; `otherActive` are the other active workflows
 * (id and collection) so two cannot be active for the same content type.
 */
export function validateWorkflowInput(
  input: WorkflowInput,
  knownRoles: ReadonlySet<string>,
  otherActive: ReadonlyArray<{ id: number; collection: string }> = [],
  selfId?: number | null,
): Array<{ path: string; message: string }> {
  const problems: Array<{ path: string; message: string }> = []
  const name = asString(input.name).trim()
  if (!name) problems.push({ path: 'name', message: 'Give the workflow a name.' })
  if (name.length > MAX_NAME_LENGTH) problems.push({ path: 'name', message: `Keep the name under ${MAX_NAME_LENGTH} characters.` })
  if (!isApprovalCollection(input.collection)) {
    problems.push({ path: 'collection', message: `Choose a content type: ${APPROVAL_COLLECTIONS.join(', ')}.` })
  }

  const checkRoles = (path: string, roles: string[], label: string) => {
    for (const slug of roles) {
      if (!knownRoles.has(slug)) problems.push({ path, message: `${label}: the role "${slug}" does not exist.` })
    }
  }
  checkRoles('submitterRoles', parseRoleList(input.submitterRoles), 'Who can submit')

  const steps = Array.isArray(input.steps) ? input.steps : []
  if (steps.length === 0) problems.push({ path: 'steps', message: 'Add at least one step.' })
  if (steps.length > MAX_WORKFLOW_STEPS) problems.push({ path: 'steps', message: `Use at most ${MAX_WORKFLOW_STEPS} steps.` })
  steps.forEach((entry, index) => {
    const step = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const label = `Step ${index + 1}`
    if (!asString(step.name).trim()) problems.push({ path: `steps.${index}.name`, message: `${label} needs a name.` })
    const approvers = parseRoleList(step.approverRoles)
    if (approvers.length === 0) problems.push({ path: `steps.${index}.approverRoles`, message: `${label} needs at least one approver role.` })
    checkRoles(`steps.${index}.approverRoles`, approvers, label)
    const needed = Number(step.approvalsNeeded)
    if (!Number.isInteger(needed) || needed < 1 || needed > MAX_APPROVALS_PER_STEP) {
      problems.push({ path: `steps.${index}.approvalsNeeded`, message: `${label}: approvals needed must be a whole number from 1 to ${MAX_APPROVALS_PER_STEP}.` })
    }
  })

  if (toBool(input.active) && isApprovalCollection(input.collection)) {
    const clash = otherActive.find((other) => other.collection === input.collection && other.id !== selfId)
    if (clash) problems.push({ path: 'active', message: `Another workflow is already active for ${input.collection}. Switch it off first.` })
  }
  return problems
}

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
}

export type ActiveWorkflows = {
  workflows: Partial<Record<ApprovalCollection, ApprovalWorkflow>>
  /** True when the workflows could not be read and there is no earlier good copy. Callers fail closed. */
  unknown: boolean
}

/** The last active workflows read successfully in this process. Used when a later read fails. */
let lastKnownGood: ApprovalWorkflow[] | null = null

/** Test hook. */
export function resetWorkflowCacheForTests(): void {
  lastKnownGood = null
}

/** Role slug to display name, best effort: a failed read only means slugs are shown instead. */
export async function loadRoleNames(engine: EngineLike): Promise<Map<string, string>> {
  const names = new Map<string, string>(BUILT_IN_ROLE_SLUGS.map((slug) => [slug, titleCase(slug)]))
  try {
    const { docs } = await engine.find({ collection: 'roles', limit: 1000, depth: 0, overrideAccess: true })
    for (const role of docs) {
      const slug = asString(role.slug)
      if (slug) names.set(slug, asString(role.name) || slug)
    }
  } catch {
    // slugs are shown instead
  }
  return names
}

const indexByCollection = (list: ApprovalWorkflow[]): ApprovalWorkflow | undefined => list[0]

function groupActive(list: ApprovalWorkflow[]): Partial<Record<ApprovalCollection, ApprovalWorkflow>> {
  const result: Partial<Record<ApprovalCollection, ApprovalWorkflow>> = {}
  for (const collection of APPROVAL_COLLECTIONS) {
    const match = indexByCollection(list.filter((workflow) => workflow.collection === collection))
    if (match) result[collection] = match
  }
  return result
}

/**
 * Every active workflow, one per content type (the lowest id wins if two are somehow active). A
 * failed read falls back to the last good answer; with none, the result is flagged `unknown` so
 * the caller blocks rather than quietly treating the content type as having no workflow. An
 * active workflow that cannot be used (no steps) also reads as unknown: it must not silently
 * switch review off.
 */
export async function loadActiveWorkflows(engine: EngineLike | null | undefined): Promise<ActiveWorkflows> {
  if (!engine || typeof engine.find !== 'function') return { workflows: {}, unknown: false }
  try {
    const { docs } = await engine.find({
      collection: WORKFLOWS_SLUG,
      where: { active: { equals: true } },
      sort: 'id',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    const active = docs.filter((doc) => doc && toBool(doc.active) && isApprovalCollection(doc.collection))
    if (active.length === 0) {
      lastKnownGood = []
      return { workflows: {}, unknown: false }
    }
    const names = await loadRoleNames(engine)
    const parsed = active.map((doc) => parseWorkflow(doc, names))
    if (parsed.some((workflow) => workflow === null)) {
      if (lastKnownGood) return { workflows: groupActive(lastKnownGood), unknown: false }
      return { workflows: {}, unknown: true }
    }
    const list = parsed as ApprovalWorkflow[]
    lastKnownGood = list
    return { workflows: groupActive(list), unknown: false }
  } catch (error) {
    console.error('approval workflows could not be loaded', error)
    if (lastKnownGood) return { workflows: groupActive(lastKnownGood), unknown: false }
    return { workflows: {}, unknown: true }
  }
}
