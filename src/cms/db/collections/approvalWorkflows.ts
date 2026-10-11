import { ApprovalWorkflows } from '@/features/approval/workflowCollection'

import { createCollectionOps } from '../generic'
import { approvalWorkflows, approvalWorkflowsSteps } from '../schema/approvalWorkflows'

export type ApprovalWorkflowStepRow = {
  id?: string
  name?: string | null
  approverRoles?: string[] | null
  approvalsNeeded?: number | null
}

/** The document shape of the `approval-workflows` collection - see src/features/approval/workflowCollection.ts. */
export type ApprovalWorkflowDoc = {
  id: number
  name: string
  collection: 'pages' | 'posts' | 'events' | 'courses' | 'products'
  active?: boolean | null
  submitterRoles?: string[] | null
  steps?: ApprovalWorkflowStepRow[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(approvalWorkflows, ApprovalWorkflows, { steps: approvalWorkflowsSteps })

export const findApprovalWorkflows = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<ApprovalWorkflowDoc[]>
/** The adapter-shaped counterpart to findApprovalWorkflows - see ../generic.ts's findPaginated doc comment. */
export const findApprovalWorkflowsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findApprovalWorkflowByID = ops.findByID as unknown as (id: number) => Promise<ApprovalWorkflowDoc | null>
export const countApprovalWorkflows = ops.count
export const createApprovalWorkflow = ops.create as unknown as (
  data: Partial<Omit<ApprovalWorkflowDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string; collection: ApprovalWorkflowDoc['collection'] },
) => Promise<ApprovalWorkflowDoc>
export const updateApprovalWorkflow = ops.updateByID as unknown as (id: number, data: Partial<Omit<ApprovalWorkflowDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<ApprovalWorkflowDoc | null>
export const deleteApprovalWorkflow = ops.deleteByID
