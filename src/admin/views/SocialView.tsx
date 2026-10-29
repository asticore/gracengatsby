import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { ConnectedAccountsPanel } from '@/features/socialLogin/components/ConnectedAccountsPanel'
import { viewConnections } from '@/features/socialLogin/connections'
import { socialMessage } from '@/features/socialLogin/messages'
import { readSocialConfig } from '@/features/socialLogin/settings'

/**
 * Server wrapper for /admin/security/social: connect or disconnect sign-in
 * providers on the signed-in staff account. Staff accounts are only ever linked
 * from here (never by email), and only when "Let admins sign in with a provider"
 * is switched on.
 */
export async function SocialView({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> } = {}) {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  const engine = await getEngine()
  const config = await readSocialConfig(engine)
  const view = await viewConnections(engine, context.user as never)
  const raw = searchParams?.social_error
  const error = typeof raw === 'string' ? socialMessage(raw) : ''

  return (
    <div style={{ maxWidth: 640, padding: '1.5rem' }}>
      <h1>Connected accounts</h1>
      {config.allowAdminSocialLogin ? (
        <p>Connect a provider to your account to sign in to the admin area with it. Your password keeps working.</p>
      ) : (
        <p>Social sign-in for staff is switched off on this site (Settings &gt; Security &gt; Social login).</p>
      )}
      <ConnectedAccountsPanel view={view} area="admin" returnTo={adminHref('/security/social', await getAdminRoot())} notice={error} />
    </div>
  )
}
