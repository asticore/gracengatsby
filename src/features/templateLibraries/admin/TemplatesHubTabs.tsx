'use client'

import Link from 'next/link'
import React from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

/** The two views of the Templates hub: the template list, and the Library tab. */
export const TemplatesHubTabs: React.FC<{ templatesHref: string; active: 'templates' | 'library' }> = ({ templatesHref, active }) => {
  const t = useAdminT()
  const tab = (key: 'templates' | 'library', label: string, href: string) => (
    <Link className={active === key ? 'btn' : 'btn btn--style-secondary'} href={href} aria-current={active === key ? 'page' : undefined}>
      {label}
    </Link>
  )
  return (
    <nav aria-label={t('templateLibraries.title')} style={{ display: 'flex', gap: 6, margin: '0 0 12px', flexWrap: 'wrap' }}>
      {tab('templates', t('templateLibraries.tabTemplates'), templatesHref)}
      {tab('library', t('templateLibraries.tabLibrary'), `${templatesHref}?view=library`)}
    </nav>
  )
}

export default TemplatesHubTabs
