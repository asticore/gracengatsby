import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess, getGlobalConfig } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { EditForm } from './EditForm'
import { HeaderFooterTabs } from './HeaderFooterTabs'

/**
 * The header and footer settings (logo, menu, announcement bar, socials, layout), shown as a tab of the Templates
 * hub (admin/templates?view=chrome). Server component: loads both globals and renders each one's normal edit form
 * (each saves its own global independently) inside a tab shell. The header and footer templates themselves are
 * edited in the hub's list; these globals are the settings the default header and footer and the menu use.
 */
export async function HeaderFooterSettings() {
  const context = await getAdminContext()
  const ui = await getAdminUi()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))

  const headerGlobal = getGlobalConfig(context.engine, 'header')
  const footerGlobal = getGlobalConfig(context.engine, 'footer')
  if (!headerGlobal || !footerGlobal) notFound()

  const canRead = (slug: string) => Boolean(context.permissions.globals?.[slug]?.read)
  if (!canRead('header') && !canRead('footer')) {
    return <p>{ui.t('mn.lit.no_access_header_footer')}</p>
  }

  const [headerDoc, footerDoc] = await Promise.all([
    canRead('header') ? context.engine.findGlobal({ slug: 'header', user: context.user }) : null,
    canRead('footer') ? context.engine.findGlobal({ slug: 'footer', user: context.user }) : null,
  ])

  const label = (g: { label?: unknown }, fallback: string) => (typeof g.label === 'string' ? g.label : fallback)

  return (
    <HeaderFooterTabs
      footer={
        footerDoc ? (
          <EditForm doc={footerDoc} fields={sanitizeFieldsForClient(footerGlobal.fields)} globalSlug="footer" />
        ) : (
          <p>{ui.t('mn.lit.no_access_footer')}</p>
        )
      }
      footerLabel={label(footerGlobal, ui.t('mn.lit.footer'))}
      header={
        headerDoc ? (
          <EditForm doc={headerDoc} fields={sanitizeFieldsForClient(headerGlobal.fields)} globalSlug="header" />
        ) : (
          <p>{ui.t('mn.lit.no_access_header')}</p>
        )
      }
      headerLabel={label(headerGlobal, ui.t('mn.lit.header'))}
    />
  )
}

/**
 * The old separate screen at /admin/header-footer. Header and footer now live in the Templates hub, under
 * "Header and footer", so this route only redirects there (old bookmarks keep working).
 */
export async function HeaderFooterView() {
  redirect(`${adminHref('/templates', await getAdminRoot())}?view=chrome`)
}

export default HeaderFooterView
