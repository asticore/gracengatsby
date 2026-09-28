'use client'

/**
 * The sidebar's one visible trigger - collapses/expands the desktop rail,
 * or opens/closes the mobile off-canvas drawer, depending on viewport (see
 * NavContext.tsx's `toggleSidebar`). Replaces the old open/close-only
 * hamburger this file used to render (a straight port of `@payloadcms/ui`'s
 * `NavToggler`) - a single adaptive "panel" icon matches the shadcn sidebar
 * pattern this rebuild is modeled on
 * (https://ui.shadcn.com/docs/components/base/sidebar), where one
 * `SidebarTrigger` button does both jobs.
 *
 * Fixed-position, outside the nav/content flow (see custom.css's
 * `.nav-toggler`, which slides itself to sit just past the sidebar's own
 * current width) - there is no AppHeader/toolbar in this admin for a trigger
 * to live inside, so a floating button is the only place for it.
 */

import React from 'react'
import { useNav } from '@/admin/context'

const PanelIcon: React.FC = () => (
  <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
    <rect fill="none" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" width="12" x="2" y="2" />
    <line stroke="currentColor" strokeWidth="1.4" x1="6.3" x2="6.3" y1="2" y2="14" />
  </svg>
)

export const NavToggler: React.FC = () => {
  const { collapsed, isMobile, navOpen, toggleSidebar } = useNav()

  const isOpenState = isMobile ? navOpen : !collapsed
  const label = isOpenState ? 'Collapse sidebar' : 'Expand sidebar'

  return (
    <button
      aria-label={label}
      className="nav-toggler"
      onClick={toggleSidebar}
      suppressHydrationWarning
      title={`${label} (Ctrl/⌘+B)`}
      type="button"
    >
      <PanelIcon />
    </button>
  )
}

export default NavToggler
