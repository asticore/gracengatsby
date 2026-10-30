import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { loadWebhooksAction } from '@/features/webhooks/actions'
import { WebhooksPanel } from '@/features/webhooks/components/WebhooksPanel'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { resolveAccess } from '@/features/roles/permissions'

/**
 * /admin/webhooks. Admins, and anyone holding the `webhooks` permission, can build webhooks.
 * The check is repeated in every server action, so a page load alone grants nothing.
 */
export async function WebhooksView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'webhooks', 'read') === 'all'
  if (!allowed) redirect(adminHref('/', await getAdminRoot()))
  const result = await loadWebhooksAction()
  if (!result.ok || !result.value) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>{result.ok === false ? result.error : ''}</p>
      </div>
    )
  }
  return <WebhooksPanel initial={result.value} />
}
