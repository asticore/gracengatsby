import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess, isAdminUser } from '@/admin/auth'
import { impersonationHistoryAction } from '@/features/impersonation/actions'
import { ImpersonationPanel } from '@/features/impersonation/components/ImpersonationPanel'
import { getSecuritySettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'

/**
 * /admin/security/impersonation. Start a short customer session and read the
 * history of every one. Only an administrator sees the form; the server refuses
 * a start from anyone else whatever this page shows.
 */
export async function ImpersonationView() {
  const context = await getAdminContext()
  const ui = await getAdminUi()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const admin = isAdminUser(context.user)
  const engine = await getEngine()
  const settings = await getSecuritySettings(engine as never)

  if (!admin) {
    return (
      <div style={{ maxWidth: 820, padding: '1.5rem' }}>
        <p>{ui.t('us.lit.only_admin')}</p>
      </div>
    )
  }

  const history = await impersonationHistoryAction()
  return (
    <div style={{ maxWidth: 1040, padding: '1.5rem' }}>
      {history.ok ? null : <p role="alert">{history.message}</p>}
      <ImpersonationPanel
        enabled={settings.impersonation.enabled}
        maxMinutes={settings.impersonation.maxMinutes}
        requireTwoFactor={settings.impersonation.requireTwoFactor}
        entries={history.entries}
      />
    </div>
  )
}
