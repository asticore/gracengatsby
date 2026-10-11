import { redirect } from 'next/navigation'
import { getAdminContext } from '@/admin/auth'
import { loadApprovalSettings } from '@/features/approval/settings'
import type { WorkflowRecord } from '@/features/approval/workflowForm'
import { RolesViewClient } from './RolesViewClient'

/**
 * Server component wrapper for roles admin view.
 * Checks admin permission and loads roles from database.
 */
export async function RolesView() {
  const context = await getAdminContext()

  // Check if user can read roles (admin-only via SECRET_RESOURCES)
  if (!context.isAdmin) {
    redirect('/admin/login')
  }

  // Load all roles
  const { docs: roles } = await context.engine.find({
    collection: 'roles',
    limit: 9999,
    user: context.user,
  })

  type RoleRecord = Record<string, unknown> & {
    id: number
    name: string
    slug: string
  }
  const rolesDocs = (roles || []) as RoleRecord[]

  // Approval workflows are admin-managed configuration; only admins reach this view (checked above).
  const workflowDocs = await context.engine
    .find({ collection: 'approval-workflows', limit: 200, depth: 0, sort: 'name', overrideAccess: true })
    .then((result) => (result.docs || []) as unknown as WorkflowRecord[])
    .catch((): WorkflowRecord[] => [])
  const approvalEnabled = (await loadApprovalSettings(context.engine as never)).enabled

  return (
    <RolesViewClient
      roles={rolesDocs}
      canEdit={context.isAdmin}
      workflows={workflowDocs}
      approvalEnabled={approvalEnabled}
    />
  )
}
