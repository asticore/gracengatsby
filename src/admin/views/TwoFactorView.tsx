import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { TwoFactorPanel } from '@/features/security/components/TwoFactorPanel'
import { backupCodesRemaining, isEnrolled } from '@/features/security/twoFactor'
import { defaultTwoFactorStore } from '@/features/security/twoFactorStore'

/**
 * Server wrapper for /admin/security/two-factor: set up, confirm, back up and
 * turn off two-step sign-in for the signed-in admin's own account. Any panel
 * user may open it; it only ever acts on the session's own user (plus the
 * admin-only reset tool, which re-checks the role on the server).
 */
export async function TwoFactorView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

  const id = Number((context.user as { id?: number | string } | null)?.id)
  const row = Number.isInteger(id) && id > 0 ? await defaultTwoFactorStore.findByID(id) : null

  return (
    <div style={{ maxWidth: 640, padding: '1.5rem' }}>
      <h1>Two-step sign-in</h1>
      <p>Protect your admin account with a code from an authenticator app.</p>
      <TwoFactorPanel
        enrolled={isEnrolled(row)}
        backupCodesLeft={row ? backupCodesRemaining(row) : 0}
        isAdmin={Boolean(context.isAdmin)}
      />
    </div>
  )
}
