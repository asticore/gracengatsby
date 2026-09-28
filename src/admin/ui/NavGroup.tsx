'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `NavGroup`.
 *
 * Simplification vs. the vendor's own version: the vendor persists each
 * group's open/closed state to the signed-in user's portal preferences
 * (`payload-preferences`) so it survives a reload. This version keeps it in
 * local component state only, seeded from the `isOpen` prop on first render.
 * Tracked in the plan doc as an intentional Phase-1 simplification - state
 * resets to `isOpen` on next login/reload instead of remembering the toggle.
 *
 * Stage 12: when the sidebar is in its collapsed desktop-rail state, group
 * headers (a text label - nothing to show in a ~72px rail) are skipped
 * entirely and every entity always renders, ignoring the open/closed toggle -
 * there's no room for a collapsible header in rail mode, and hiding entities
 * there would make them unreachable without expanding first.
 */

import React, { useState } from 'react'
import { useNav } from '@/admin/context'

export const NavGroup: React.FC<{
  children: React.ReactNode
  isOpen?: boolean
  label: string
}> = ({ children, isOpen, label }) => {
  const [open, setOpen] = useState(Boolean(isOpen))
  const { collapsed, isMobile } = useNav()
  const rail = collapsed && !isMobile

  if (rail) {
    return (
      <div className="nav-group" title={label}>
        <div className="nav-group__content">{children}</div>
      </div>
    )
  }

  return (
    <div className={`nav-group${open ? ' nav-group--open' : ''}`}>
      <button className="nav-group__toggle" onClick={() => setOpen((prev) => !prev)} type="button">
        <span className="nav-group__label">{label}</span>
      </button>
      {open && <div className="nav-group__content">{children}</div>}
    </div>
  )
}

export default NavGroup
