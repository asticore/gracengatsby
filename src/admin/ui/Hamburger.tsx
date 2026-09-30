'use client'

/**
 * From-scratch replacement for `the vendor package`'s `Hamburger`. Presentational
 * only.
 *
 * `suppressHydrationWarning` defaults to false (every existing caller passes
 * a constant `isActive`, e.g. AdminNavHamburger's `<Hamburger isActive />>`,
 * so there is nothing to mismatch there). NavToggler.tsx is the one caller
 * that ties `isActive` to `navOpen` - a client-only viewport check the server
 * render can't perform (see NavContext.tsx) - and passes `true` to silence
 * the resulting, otherwise-permanent, mismatch on this element's own class.
 */

import React from 'react'

export const Hamburger: React.FC<{ isActive?: boolean; suppressHydrationWarning?: boolean }> = ({
  isActive,
  suppressHydrationWarning,
}) => (
  <div className={`hamburger${isActive ? ' hamburger--active' : ''}`} suppressHydrationWarning={suppressHydrationWarning}>
    <div className="hamburger__line" />
    <div className="hamburger__line" />
    <div className="hamburger__line" />
  </div>
)

export default Hamburger
