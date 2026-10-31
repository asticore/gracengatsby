import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { loadPrivacyAction } from '@/features/privacy/actions'
import { PrivacyPanel } from '@/features/privacy/components/PrivacyPanel'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { resolveAccess } from '@/features/roles/permissions'

/**
 * /admin/privacy. Admins, and anyone holding the `privacy` permission, can see the requests. Every
 * server action repeats the check, so a page load alone changes nothing.
 */
export async function PrivacyView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'privacy', 'read') === 'all'
  if (!allowed) redirect(adminHref('/', await getAdminRoot()))
  const result = await loadPrivacyAction()
  if (!result.ok || !result.value) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>{result.ok === false ? result.error : ''}</p>
      </div>
    )
  }
  return <PrivacyPanel initial={result.value} />
}
