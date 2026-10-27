'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, type KeyboardEvent } from 'react'
import { SECTION_PANEL_ID, sectionTabId } from '@/admin/list/viewTabs'
import './list-section-tabs.css'

export type ListSectionTabInfo = {
  key: string
  label: string
  /** False when the user may not open the tab: it stays visible, marked as unavailable, with its reason as a tooltip. */
  allowed: boolean
  primary: boolean
  deniedReason: string
}


/** The URL a tab points at: the plain list URL for the first tab, `?tab=<key>` for the others. */
export function sectionTabHref(pathname: string, tab: Pick<ListSectionTabInfo, 'key' | 'primary'>): string {
  return tab.primary ? pathname : `${pathname}?tab=${encodeURIComponent(tab.key)}`
}

/**
 * The tab bar at the top of the Forms, Events and A/B tests list pages: a real
 * ARIA tablist. The selected tab is `?tab=<key>` (the server renders the
 * matching panel), and `#<key>` in the address bar is honoured too, so a link
 * such as /admin/content/forms#submissions opens the right tab.
 *
 * Arrow keys, Home and End move between tabs (the tab activates as it gets
 * focus). A tab the user may not open is still shown, marked unavailable and
 * explained, so nobody wonders where it went.
 */
export function ListSectionTabs({ tabs, activeKey, label }: { tabs: ListSectionTabInfo[]; activeKey: string; label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const listRef = useRef<HTMLDivElement>(null)

  // Open the tab named in the hash when the URL has no ?tab= of its own.
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, '')
    if (!fromHash || window.location.search.includes('tab=')) return
    const wanted = tabs.find((tab) => tab.key === fromHash)
    if (wanted && !wanted.primary && wanted.key !== activeKey) router.replace(sectionTabHref(pathname, wanted))
  }, [tabs, activeKey, pathname, router])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const index = tabs.findIndex((tab) => tab.key === activeKey)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else next = tabs.length - 1
    event.preventDefault()
    const target = tabs[next]
    router.push(sectionTabHref(pathname, target))
    // Move focus now; the page for the new tab re-renders around it.
    const elements = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
    elements?.[next]?.focus()
  }

  return (
    <div aria-label={label} className="lst-tablist" onKeyDown={onKeyDown} ref={listRef} role="tablist">
      {tabs.map((tab) => {
        const selected = tab.key === activeKey
        return (
          <Link
            aria-controls={SECTION_PANEL_ID}
            aria-disabled={tab.allowed ? undefined : true}
            aria-selected={selected}
            className={`lst-tab${selected ? ' lst-tab--active' : ''}${tab.allowed ? '' : ' lst-tab--disabled'}`}
            href={sectionTabHref(pathname, tab)}
            id={sectionTabId(tab.key)}
            key={tab.key}
            role="tab"
            tabIndex={selected ? 0 : -1}
            title={tab.allowed ? undefined : tab.deniedReason}
          >
            {tab.label}
            {!tab.allowed && <span className="lst-tab__lock"> (no access)</span>}
          </Link>
        )
      })}
    </div>
  )
}

export default ListSectionTabs
