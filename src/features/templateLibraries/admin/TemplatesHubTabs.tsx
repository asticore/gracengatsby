'use client'

import Link from 'next/link'
import React from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/** The views of the Templates hub: the template list, the Library tab, and the header and footer settings. */
export const TemplatesHubTabs: React.FC<{ templatesHref: string; active: 'templates' | 'library' | 'chrome' }> = ({ templatesHref, active }) => {
  const t = useAdminT()
  const tab = (key: 'templates' | 'library' | 'chrome', label: string, href: string) => (
    <Link className={active === key ? 'btn' : 'btn btn--style-secondary'} href={href} aria-current={active === key ? 'page' : undefined}>
      {label}
    </Link>
  )
  return (
    <nav aria-label={t('templateLibraries.title')} style={{ display: 'flex', gap: 6, margin: '0 0 12px', flexWrap: 'wrap' }}>
      {tab('templates', t('templateLibraries.tabTemplates'), templatesHref)}
      {tab('library', t('templateLibraries.tabLibrary'), `${templatesHref}?view=library`)}
      {tab('chrome', t('siteTemplates.tabChrome'), `${templatesHref}?view=chrome`)}
    </nav>
  )
}

export default TemplatesHubTabs
