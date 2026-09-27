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
 *
 * `hydrated` is the one exception to the "lazy initializer, no effect" rule
 * above, and deliberately so. A lazy initializer's value differs between the
 * server render and the client's OWN hydration render (same idea as
 * `navOpen`'s), but for a plain boolean flag like this one, that difference
 * is exactly the kind of mismatch React logs and then leaves alone: "A tree
 * hydrated but some attributes of the server rendered HTML didn't match the
 * client properties. This won't be patched up." - attribute mismatches
 * discovered DURING hydration are not synced to the client's computed value,
 * unlike an ordinary post-hydration re-render, which applies it normally.
 * Confirmed live: without an explicit post-mount update, every element whose
 * class reads `hydrated` (this admin's `.template-default` wrapper, its nav
 * toggler) stayed stuck on the server's `hydrated: false` classes forever -
 * on a real page that means stock CSS's `.template-default .nav{display:
 * none}` never resolves to `display:unset`, permanently hiding the sidebar
 * until some UNRELATED state change elsewhere forces a normal re-render.
 * Real Payload's own `NavProvider` (`@payloadcms/ui/dist/elements/Nav/
 * context.js`) hits this identical constraint and solves it the same way -
 * a `useEffect` that flips `hydrated` (and re-syncs `navOpen`) once, right
 * after mount. That one, isolated `set-state-in-effect` is the deliberate
 * exception; nothing else in this file needs it.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

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

export const NavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navOpen, setNavOpenState] = useState(getInitialNavOpen)
  const [hydrated, setHydrated] = useState(false)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  // Deliberate mount-flag pattern, see this file's header comment: only a
  // real post-hydration re-render (not the lazy initializer above) actually
  // unhides the nav. Matches real Payload's own NavProvider.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHydrated(true)
    setNavOpenState(getInitialNavOpen())
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

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
