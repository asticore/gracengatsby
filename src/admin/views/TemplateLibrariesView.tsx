import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'

/**
 * Settings > Template libraries. Placeholder: the library mechanism is not built yet, so the list is empty.
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
      <p>Add libraries of ready-made templates. Coming next.</p>
      <ul aria-label="Template libraries" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }} />
      <p className="list-empty">No libraries added yet.</p>
    </div>
  )
}

export default TemplateLibrariesView
