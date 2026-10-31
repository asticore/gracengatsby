import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { TemplateLibrariesManager } from '@/features/templateLibraries/admin/TemplateLibrariesManager'

/**
 * Settings > Template libraries: add, switch on or off, refresh and remove GitHub template libraries.
 * Linked from the Templates hub.
 */
export async function TemplateLibrariesView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  return (
    <div className="list-view">
      <div className="list-header">
        <h1>Template libraries</h1>
        <AdminLink className="btn" path="/templates">Back to Templates</AdminLink>
      </div>
      <TemplateLibrariesManager />
    </div>
  )
}

export default TemplateLibrariesView
