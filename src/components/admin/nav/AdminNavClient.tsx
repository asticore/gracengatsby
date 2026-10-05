'use client'

import React from 'react'
import { Hamburger, Link, NavGroup, useNav } from '@/engine/ui'
import { usePathname } from 'next/navigation'

const baseClass = 'nav'

export type ResolvedNavEntity = {
  slug: string
  label: string
  href: string
  id: string
}

export type ResolvedNavGroup = {
  label: string
  entities: ResolvedNavEntity[]
}

/** First letter of a label, for the collapsed rail's per-link badge (see custom.css's `.nav__link-badge`). */
function initialOf(label: string): string {
  return label.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Client half of the custom admin nav.
 *
 * Behaves like the CMS engine's DefaultNavClient with one deliberate difference:
 * groups start COLLAPSED unless the user has explicitly opened them before.
 * The engine passes `isOpen={prefs?.[label]?.open}` which is `undefined` for a
 * group the user has never toggled, and NavGroup treats `undefined` as open.
 * Defaulting that to `false` is what makes every group collapsed on a fresh
 * login while still respecting whatever the user opens afterwards (NavGroup
 * writes their choice back to their saved portal preferences on toggle).
 *
 * Stage 12: every link also renders a small lettered badge
 * (`nav__link-badge`), hidden by CSS unless the sidebar is in its collapsed
 * desktop-rail state - there is no per-entity icon set in this app's nav data
 * to show instead (see custom.css's own comment on `.nav__link-badge`).
 */
export const AdminNavClient: React.FC<{
  groups: ResolvedNavGroup[]
  openGroups: Record<string, boolean>
}> = ({ groups, openGroups }) => {
  const pathname = usePathname()

  const renderEntity = (entity: ResolvedNavEntity, entityKey: string) => {
    const isActive = pathname.startsWith(entity.href) && ['/', undefined].includes(pathname[entity.href.length])

    const label = (
      <React.Fragment>
        {isActive && <div className={`${baseClass}__link-indicator`} />}
        <span className={`${baseClass}__link-badge`} aria-hidden="true">
          {initialOf(entity.label)}
        </span>
        <span className={`${baseClass}__link-label`}>{entity.label}</span>
      </React.Fragment>
    )

    if (pathname === entity.href) {
      return (
        <div className={`${baseClass}__link`} id={entity.id} key={entityKey} title={entity.label}>
          {label}
        </div>
      )
    }

    return (
      <Link className={`${baseClass}__link`} href={entity.href} id={entity.id} key={entityKey} prefetch={false} title={entity.label}>
        {label}
      </Link>
    )
  }

  return (
    <React.Fragment>
      {groups.map((group) => (
        <NavGroup key={group.label} label={group.label} isOpen={openGroups[group.label] ?? false}>
          {group.entities.map((entity) => renderEntity(entity, entity.slug))}
        </NavGroup>
      ))}
    </React.Fragment>
  )
}

/**
 * Top-of-sidebar link back to the portal dashboard. Sits above the groups so
 * there is always a one-click route home, whatever you have drilled into.
 */
export const AdminNavDashboardLink: React.FC<{ href: string }> = ({ href }) => {
  const pathname = usePathname()
  const isActive = pathname === href || pathname === `${href}/`

  return (
    <Link
      className={`ac-nav-dashboard ${isActive ? 'ac-nav-dashboard--active' : ''}`}
      href={href}
      id="nav-dashboard"
      prefetch={false}
      title="Dashboard"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span>Dashboard</span>
    </Link>
  )
}

/**
 * Equivalent of the CMS engine's internal NavWrapper. Re-implemented here
 * because the engine's Next integration does not export it, but the pieces it depends on
 * (the `useNav` context) are public.
 *
 * Stage 12: also carries the desktop collapsed-rail state (`--collapsed`),
 * independent of the mobile `--open`/`--hydrated` modifiers this already had.
 */
export const AdminNavShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { collapsed, hydrated, isMobile, navOpen, navRef, shouldAnimate } = useNav()

  const className = [
    baseClass,
    navOpen && `${baseClass}--open`,
    collapsed && !isMobile && `${baseClass}--collapsed`,
    shouldAnimate && `${baseClass}--animate`,
    hydrated && `${baseClass}--hydrated`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // navOpen's initial value comes from a client-only viewport check (see
    // NavContext's getInitialNavOpen) that the server render can't perform,
    // so the very first client render can legitimately disagree with the
    // server-rendered class here - suppressed rather than "fixed", same as
    // MediaGalleryGrid's tile-size preference.
    <aside className={className} inert={!navOpen && isMobile ? true : undefined} suppressHydrationWarning>
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {children}
      </div>
    </aside>
  )
}

/** Mobile-only close button, equivalent to the CMS engine's internal NavHamburger. */
export const AdminNavHamburger: React.FC = () => {
  const { navOpen, setNavOpen } = useNav()

  return (
    <button
      className={`${baseClass}__mobile-close`}
      onClick={() => setNavOpen(false)}
      tabIndex={!navOpen ? -1 : undefined}
      type="button"
    >
      <Hamburger isActive />
    </button>
  )
}
