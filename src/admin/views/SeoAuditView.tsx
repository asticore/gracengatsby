import { redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { AUDIT_COLLECTIONS, type AuditCollection } from '@/features/seo/audit'
import { SeoAuditClient } from './SeoAuditClient'

/**
 * Server wrapper for the SEO audit at /admin/seo-audit. Anyone who can read at
 * least one of the audited places may open it; the rows returned by the API
 * are limited to the same places.
 */
export async function SeoAuditView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

  const can = context.can as unknown as (resource: string, action: string) => boolean
  const allowed: AuditCollection[] = AUDIT_COLLECTIONS.filter((collection) => context.isAdmin || can(collection, 'read'))
  if (allowed.length === 0) redirect('/admin')

  return <SeoAuditClient collections={allowed} />
}
