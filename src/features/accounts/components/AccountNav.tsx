'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { SignOutButton } from './AccountForms'

export type AccountNavLink = { href: string; label: string }

/**
 * The account portal's navigation - an expanding off-canvas drawer on mobile
 * (≤720px, matching `AccountStyles`'s existing breakpoint), a plain always-
 * visible sidebar on desktop (unchanged from before this component existed).
 *
 * Split out of `AccountShell.tsx` (a Server Component) into its own
 * `'use client'` component because the toggle needs `useState` - this is the
 * ONLY client-side piece of the account shell; `AccountShell`/`AuthShell`
 * themselves stay server components, matching this project's usual pattern
 * of keeping the client boundary as small as possible (see the admin field
 * renderers for the same convention).
 *
 * Previously this nav was a static `<ul>` with a responsive CSS breakpoint
 * that only ever RESTACKED it (grid-template-columns: 1fr on mobile) - it
 * was always visible, taking up permanent vertical space above the page
 * content on small screens, never an expanding/collapsing off-canvas menu.
 * There was no toggle button, no open/closed state, and no slide-in CSS at
 * all (confirmed 2026-09-26 - this was never built, not a regression; git
 * history shows the file was added in one shot with the rest of the
 * customer-accounts feature). This component adds the missing toggle
 * button + backdrop + slide-in drawer, wired only for the mobile breakpoint
 * `AccountStyles` already reserves - desktop is visually unchanged.
 */
export function AccountNav({ links, current }: { links: AccountNavLink[]; current: string }) {
  const [open, setOpen] = useState(false)

  // Close on Escape, and if the viewport is resized past the mobile
  // breakpoint while the drawer happens to be open (avoids a hidden
  // `--open` drawer silently intercepting layout once past 720px, since the
  // `--open` transform only APPLIES inside the mobile media query, but the
  // backdrop element does not).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const mql = window.matchMedia('(max-width: 720px)')
    const onMqlChange = () => {
      if (!mql.matches) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    mql.addEventListener('change', onMqlChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      mql.removeEventListener('change', onMqlChange)
    }
  }, [open])

  return (
    <div className="account-nav-wrap">
      <button
        type="button"
        className="account-nav-toggle"
        aria-expanded={open}
        aria-controls="account-nav-drawer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="account-nav-toggle__bars" aria-hidden="true" />
        Menu
      </button>
      {open && <div className="account-nav-backdrop" onClick={() => setOpen(false)} />}
      <nav
        aria-label="Your account"
        id="account-nav-drawer"
        className={`account-nav-drawer${open ? ' account-nav-drawer--open' : ''}`}
      >
        <ul className="account-nav">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={link.href === current ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="account-link-row">
          <SignOutButton />
        </div>
      </nav>
    </div>
  )
}
