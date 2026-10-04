'use client'

import React, { useEffect, useState } from 'react'

type Tab = 'header' | 'footer'

/**
 * Tab shell for the combined Header and footer screen. Both panels stay mounted
 * (hidden, not unmounted) so unsaved edits in one tab survive switching. The
 * selected tab is kept in the URL hash. The panels are the existing global edit
 * forms, rendered by the server component and passed in as nodes.
 */
export const HeaderFooterTabs: React.FC<{
  header: React.ReactNode
  footer: React.ReactNode
  headerLabel?: string
  footerLabel?: string
}> = ({ header, footer, headerLabel = 'Header', footerLabel = 'Footer' }) => {
  const [active, setActive] = useState<Tab>('header')

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash !== 'header' && hash !== 'footer') return
    // Deferred so the effect does not set state synchronously (and SSR markup matches the first render).
    const id = window.setTimeout(() => setActive(hash), 0)
    return () => window.clearTimeout(id)
  }, [])

  const select = (tab: Tab) => {
    setActive(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'header', label: headerLabel },
    { key: 'footer', label: footerLabel },
  ]

  return (
    <div className="header-footer-view">
      <div className="header-footer-view__header">
        <h1>Header and footer</h1>
      </div>
      <div className="header-footer-tabs">
        <div className="header-footer-tabs__list" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`${tab.key}-panel`}
              aria-selected={active === tab.key}
              className={`header-footer-tabs__button${active === tab.key ? ' header-footer-tabs__button--active' : ''}`}
              id={`${tab.key}-tab`}
              key={tab.key}
              onClick={() => select(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div aria-labelledby="header-tab" className="header-footer-panel" hidden={active !== 'header'} id="header-panel" role="tabpanel">
        {header}
      </div>
      <div aria-labelledby="footer-tab" className="header-footer-panel" hidden={active !== 'footer'} id="footer-panel" role="tabpanel">
        {footer}
      </div>
    </div>
  )
}

export default HeaderFooterTabs
