import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { ImportContentClient } from './ImportContentClient'

/**
 * Server wrapper for /admin/import-content. Needs an admin login and create
 * permission for at least one of pages or posts; the API checks each type again.
 */
export async function ImportContentView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  const can = context.can as unknown as (resource: string, action: string) => boolean
  if (!(context.isAdmin || can('pages', 'create') || can('posts', 'create'))) {
    return <p>You do not have permission to create pages or posts, so you cannot import content.</p>
  }
  return <ImportContentClient />
}

export default ImportContentView