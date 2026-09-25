'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `useNav`.
 *
 * Backs AdminNavClient.tsx's AdminNavShell/AdminNavHamburger, and any future
 * consumer of the nav-open toggle. `navOpen`/`hydrated` are seeded with a
 * client-only viewport check inside useState's lazy initializer, not a
 * useEffect - a version that reconciled them via useEffect + setState trips
 * eslint-plugin-react-hooks' set-state-in-effect rule (React 19: setState
 * called synchronously in an effect body risks a cascading render), the same
 * issue and the same fix already established in
 * src/views/media/MediaGalleryGrid.tsx's readStoredSize. The lazy initializer
 * runs during the client's very first render (same as any render), so it
 * disagrees with the server-rendered markup (which always assumes desktop,
 * not-yet-hydrated) - that one-time mismatch is silenced with
 * `suppressHydrationWarning` on the single element whose class depends on
 * these values (AdminNavClient's AdminNavShell `<aside>`).
 *
 * `shouldAnimate` stays false until the first explicit toggle so the initial
 * open/closed state never animates in.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

type NavContextValue = {
  hydrated: boolean
  navOpen: boolean
  navRef: React.RefObject<HTMLDivElement | null>
  setNavOpen: (open: boolean) => void
  shouldAnimate: boolean
}

const NavContext = createContext<NavContextValue | null>(null)

const MOBILE_QUERY = '(max-width: 768px)'

function getInitialNavOpen(): boolean {
  if (typeof window === 'undefined') return true
  return !window.matchMedia(MOBILE_QUERY).matches
}

function getInitialHydrated(): boolean {
  return typeof window !== 'undefined'
}

export const NavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navOpen, setNavOpenState] = useState(getInitialNavOpen)
  const [hydrated] = useState(getInitialHydrated)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  const setNavOpen = useCallback((open: boolean) => {
    setShouldAnimate(true)
    setNavOpenState(open)
  }, [])

  const value = useMemo(
    () => ({ hydrated, navOpen, navRef, setNavOpen, shouldAnimate }),
    [hydrated, navOpen, setNavOpen, shouldAnimate],
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within a NavProvider')
  return ctx
}
