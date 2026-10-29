import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { PasswordGroupsClient } from '@/admin/views/PasswordGroupsClient'

/**
 * /admin/security/password-groups. Shared passwords that protect many documents: create, rotate, delete,
 * and see which content uses each. Administrators manage groups; editors with the password-protect
 * permission can see the list (names and usage, never a hash). The API enforces this either way.
 */
export async function PasswordGroupsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!(context.isAdmin || context.can('admin-visibility-password', 'update'))) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>You do not have permission to see password groups.</p>
      </div>
    )
  }
  return <PasswordGroupsClient />
}
