import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { passkeyDepsFor } from '@/features/accounts/passkeysWiring'
import { requestClient } from '@/features/accounts/session'
import { listPasskeys } from '@/features/passkeys'
import { PasskeysPanel } from '@/features/passkeys/components/PasskeysPanel'
import { getEngine } from '@/lib/engine'

/**
 * Server wrapper for /admin/security/passkeys: the signed-in admin's own passkeys.
 * Shown only when the owner has turned passkeys on for admins; otherwise a plain
 * note says why, and nothing can be added.
 */
export async function PasskeysView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  const engine = await getEngine()
  const deps = await passkeyDepsFor(engine, await requestClient(), '')
  const userId = Number((context.user as unknown as { id: number }).id)

  let body
  if (!deps.settings.enabled) {
    body = <p>Passkeys are turned off on this site. The site owner can turn them on under Security settings.</p>
  } else if (!deps.settings.allowAdmins) {
    body = <p>Passkeys are on for customers, but the site owner has not allowed them for admins.</p>
  } else {
    body = <PasskeysPanel initial={await listPasskeys(deps, userId)} />
  }

  return (
    <div style={{ maxWidth: 720, padding: '1.5rem' }}>
      <p>A passkey lets you sign in with Face ID, Touch ID, Windows Hello or a security key. It is an extra way in: your password keeps working.</p>
      {body}
    </div>
  )
}
