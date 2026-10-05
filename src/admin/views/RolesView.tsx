import { redirect } from 'next/navigation'
import { getAdminContext } from '@/admin/auth'
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

  return (
    <RolesViewClient
      roles={rolesDocs}
      canEdit={context.isAdmin}
    />
  )
}
