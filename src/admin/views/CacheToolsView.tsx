import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { CacheToolsClient } from './CacheToolsClient'

/**
 * Server wrapper for /admin/cache-tools: clear the saved page copies now, and
 * switch Cloudflare development mode on or off. Admins, and anyone who may
 * update Speed settings, can open it.
 */
export async function CacheToolsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!context.isAdmin && !context.can('settings:speed-settings', 'update')) redirect(adminHref('', await getAdminRoot()))

  return <CacheToolsClient />
}