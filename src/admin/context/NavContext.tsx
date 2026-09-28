'use client'

/**
 * From-scratch sidebar state - no longer a straight port of `@payloadcms/ui`'s
 * `useNav` (Stage 12: full custom rebuild adds a real collapsible/compressible
 * desktop rail, matching the shadcn sidebar pattern the user pointed at:
 * https://ui.shadcn.com/docs/components/base/sidebar).
 *
 * Two independent axes, because they mean different things at different
 * widths:
 *   - `navOpen` - the MOBILE off-canvas drawer (< 769px). Whether the nav is
 *     on/off screen. Unchanged from before this rebuild.
 *   - `collapsed` - the DESKTOP rail (>= 769px). Whether the nav is full width
 *     (labels + the collapsed-rail badges hidden) or the icon-rail width
 *     (labels hidden, badges shown) - see custom.css's `.nav--collapsed`.
 *     Persisted to localStorage so a reload keeps your last choice, the same
 *     thing shadcn's own sidebar does with a cookie.
 *
 * `toggleSidebar()` is what the one visible trigger button (NavToggler.tsx)
 * calls - it picks WHICH axis to flip based on `isMobile`, so there is a
 * single control whose behavior adapts to viewport, same as shadcn's own
 * `SidebarTrigger`. Ctrl/Cmd+B also calls it, matching that same reference.
 *
 * Every value below has a legitimate server/client mismatch on first
 * hydration (`navOpen`/`collapsed`/`isMobile` all read from `window` in their
 * lazy initializers, which the server render can't do) - `hydrated` exists
 * so consumers can suppress that one, real mismatch via
 * `suppressHydrationWarning` without silencing anything else. See
 * TemplateDefaultWrapper.tsx's history (removed this same rebuild) for the
 * concrete bug this pattern fixes: React does NOT patch an attribute
 * mismatch discovered during hydration itself - it has to be applied in a
 * post-mount effect, never in the lazy initializer alone.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

type NavContextValue = {
  collapsed: boolean
  hydrated: boolean
  isMobile: boolean
  navOpen: boolean
  navRef: React.RefObject<HTMLDivElement | null>
  setCollapsed: (collapsed: boolean) => void
  setNavOpen: (open: boolean) => void
  shouldAnimate: boolean
  toggleSidebar: () => void
}

const NavContext = createContext<NavContextValue | null>(null)

const MOBILE_QUERY = '(max-width: 768px)'
const COLLAPSED_STORAGE_KEY = 'ac-nav-collapsed'

function getInitialNavOpen(): boolean {
  if (typeof window === 'undefined') return true
  return !window.matchMedia(MOBILE_QUERY).matches
}

function getInitialIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    // Private browsing / storage disabled - fall back to expanded.
    return false
  }
}

export const NavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navOpen, setNavOpenState] = useState(getInitialNavOpen)
  const [collapsed, setCollapsedState] = useState(getInitialCollapsed)
  const [isMobile, setIsMobile] = useState(getInitialIsMobile)
  const [hydrated, setHydrated] = useState(false)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHydrated(true)
    setNavOpenState(getInitialNavOpen())
    setIsMobile(getInitialIsMobile())

    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const setNavOpen = useCallback((open: boolean) => {
    setShouldAnimate(true)
    setNavOpenState(open)
  }, [])

  const setCollapsed = useCallback((next: boolean) => {
    setShouldAnimate(true)
    setCollapsedState(next)
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Nothing to persist to - the in-memory state above still works for this session.
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setNavOpen(!navOpen)
    } else {
      setCollapsed(!collapsed)
    }
  }, [collapsed, isMobile, navOpen, setCollapsed, setNavOpen])

  // Cmd/Ctrl+B - same shortcut shadcn's own SidebarTrigger uses.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const value = useMemo(
    () => ({ collapsed, hydrated, isMobile, navOpen, navRef, setCollapsed, setNavOpen, shouldAnimate, toggleSidebar }),
    [collapsed, hydrated, isMobile, navOpen, setCollapsed, setNavOpen, shouldAnimate, toggleSidebar],
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within a NavProvider')
  return ctx
}
