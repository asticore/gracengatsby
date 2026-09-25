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
 */

import React, { useState } from 'react'

export const NavGroup: React.FC<{
  children: React.ReactNode
  isOpen?: boolean
  label: string
}> = ({ children, isOpen, label }) => {
  const [open, setOpen] = useState(Boolean(isOpen))

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
