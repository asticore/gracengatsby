'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `NavToggler`, wired up the
 * way `@payloadcms/next`'s `DefaultTemplate` places it: OUTSIDE the nav/main
 * grid wrapper (see TemplateDefaultWrapper.tsx), inside its own
 * `template-default__nav-toggler-wrapper` > `template-default__nav-toggler-
 * container` sticky-positioned shell (stock `@payloadcms/next/css` targets
 * those exact class names). Read directly from
 * `@payloadcms/ui/dist/elements/Nav/NavToggler` and
 * `@payloadcms/next/dist/templates/Default/index.js` to match both the
 * markup nesting and the click behavior (`setNavOpen(!navOpen)`, plus
 * persisting the choice to the nav preference below the desktop breakpoint -
 * intentionally NOT reproduced here, since this app's `useNav` has no
 * preference-persistence concept, same simplification NavGroup.tsx already
 * makes).
 *
 * This is the missing OPEN button. AdminNavHamburger (AdminNavClient.tsx) is
 * a CLOSE-only button that lives INSIDE the nav itself - before this file,
 * there was no way to reopen the nav once it started (or was toggled)
 * closed, and no wrapper class for stock CSS to lay nav + content out side by
 * side in the first place (see TemplateDefaultWrapper.tsx for that half of
 * the fix).
 */

import React from 'react'
import { useNav } from '@/admin/context'
import { Hamburger } from './Hamburger'

const baseClass = 'template-default'

export const NavToggler: React.FC = () => {
  const { navOpen, setNavOpen } = useNav()

  const className = ['nav-toggler', navOpen && 'nav-toggler--is-open', `${baseClass}__nav-toggler`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={`${baseClass}__nav-toggler-wrapper`} id="nav-toggler">
      <div className={`${baseClass}__nav-toggler-container`}>
        {/* navOpen's initial value is a client-only viewport check (see
            NavContext's getInitialNavOpen) that the server render can't
            perform - same server/client mismatch documented on
            TemplateDefaultWrapper.tsx and AdminNavShell's <aside>, and just
            as unpatched without this on a narrow (mobile) viewport. */}
        <button
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          className={className}
          onClick={() => setNavOpen(!navOpen)}
          suppressHydrationWarning
          type="button"
        >
          <Hamburger isActive={navOpen} suppressHydrationWarning />
        </button>
      </div>
    </div>
  )
}

export default NavToggler
