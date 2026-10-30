import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { loadBuilderAction } from '@/features/apiBuilder/actions'
import { ApiBuilderPanel } from '@/features/apiBuilder/components/ApiBuilderPanel'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { resolveAccess } from '@/features/roles/permissions'

/**
 * /admin/api-builder. Admins, and anyone holding the `api` permission, can build endpoints.
 * The check is repeated in every server action, so a page load alone grants nothing.
 */
export async function ApiBuilderView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'api', 'read') === 'all'
  if (!allowed) redirect(adminHref('/', await getAdminRoot()))
  const result = await loadBuilderAction()
  if (!result.ok || !result.value) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>{result.ok === false ? result.error : ''}</p>
      </div>
    )
  }
  return <ApiBuilderPanel initial={result.value} />
}
