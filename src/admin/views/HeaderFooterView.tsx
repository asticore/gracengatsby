import { getAdminUi } from '@/admin/i18n/serverUi'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, hasAdminPanelAccess, getGlobalConfig } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { EditForm } from './EditForm'
import { HeaderFooterTabs } from './HeaderFooterTabs'

/**
 * Combined Header and footer screen at /admin/header-footer.
 * Server component: loads both globals and renders each one's normal edit form
 * (each saves its own global independently) inside a tab shell. The old
 * /admin/globals/header and /admin/globals/footer screens are untouched.
 */
export async function HeaderFooterView() {
  const context = await getAdminContext()
  const ui = await getAdminUi()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

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

export default HeaderFooterView
