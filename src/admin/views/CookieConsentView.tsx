import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getGlobalConfig, hasAdminPanelAccess } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { normaliseConsentConfig } from '@/features/consent/config'
import { CookieConsentClient } from './CookieConsentClient'
import { revealConsentGroup } from './cookieConsentFields'

/**
 * Server wrapper for /admin/cookie-consent: banner settings, a preview and the
 * consent log. Same access as editing Integrations: administrators only.
 */
export async function CookieConsentView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!context.isAdmin || !context.permissions.globals?.integrations?.read) {
    return <p>You do not have access to the cookie consent settings.</p>
  }

  const globalConfig = getGlobalConfig(context.engine, 'integrations')
  if (!globalConfig) notFound()

  const doc = await context.engine.findGlobal({ slug: 'integrations', user: context.user })
  const seo = (await context.engine
    .findGlobal({ slug: 'seo-settings', depth: 0, user: context.user })
    .catch((): null => null)) as { analytics?: unknown } | null

  return (
    <CookieConsentClient
      doc={doc as Record<string, unknown>}
      fields={revealConsentGroup(sanitizeFieldsForClient(globalConfig.fields))}
      config={normaliseConsentConfig(doc, seo?.analytics)}
    />
  )
}

export default CookieConsentView
