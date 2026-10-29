import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { SessionsPanel } from '@/features/security/components/SessionsPanel'
import { SESSION_COOKIE } from '@/features/security/loginProtection'
import { viewOwnSessions, type SessionActor } from '@/features/security/userSessionService'
import { defaultUserSessionStore } from '@/features/security/userSessionStore'
import { sessionIdFromToken } from '@/features/security/userSessions'

/**
 * Server wrapper for /admin/security/sessions: the signed-in devices of the
 * admin's own account, with Revoke and "Sign out other devices". Any panel user
 * may open it; admins also get the look-up tool for other accounts (its server
 * actions re-check the role).
 */
export async function SessionsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  const actor = context.user as unknown as SessionActor
  const currentId = sessionIdFromToken((await cookies()).get(SESSION_COOKIE)?.value ?? null)
  const sessions = await viewOwnSessions(
    { store: defaultUserSessionStore, record: async (): Promise<void> => undefined, limited: () => false },
    actor,
    currentId,
  ).catch((): [] => [])

  return (
    <div style={{ maxWidth: 720, padding: '1.5rem' }}>
      <h1>Signed-in devices</h1>
      <p>Every browser currently signed in to your account. Revoke any you do not recognise.</p>
      <SessionsPanel sessions={sessions} isAdmin={Boolean(context.isAdmin)} />
    </div>
  )
}
