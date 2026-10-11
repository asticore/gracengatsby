import { ApprovalWorkflows } from '@/features/approval/workflowCollection'

import { generateArrayTable, generateTable } from './generate'

/**
 * Tables for the `approval-workflows` collection: eg_approval_workflows and the child table of its
 * `steps` array. Kept in their own file (like ./reviewEvents.ts) so the schema index is not edited.
 */
const approvalWorkflowsGenerated = generateTable(ApprovalWorkflows)
export const approvalWorkflows = approvalWorkflowsGenerated.table

const [stepsField] = approvalWorkflowsGenerated.arrayFields
export const approvalWorkflowsSteps = generateArrayTable(ApprovalWorkflows.slug, approvalWorkflowsGenerated.tableName, stepsField).table
