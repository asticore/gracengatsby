'use client'

/**
 * Admin color-scheme (light/dark/auto) preference.
 *
 * custom.css already has full light/dark/auto support - `[data-theme='dark']`
 * / `[data-theme='light']` on `:root`, plus a `prefers-color-scheme` media
 * query for 'auto' (no attribute at all) - see that file's own header
 * comment. What was missing was any UI to set it; this context + the
 * ThemeToggler icon (top-right, see custom.css's `.theme-toggler`) are that
 * piece. Persisted to localStorage (`ac-theme`), same pattern as
 * NavContext's `ac-nav-collapsed`.
 *
 * The stored preference is applied by mutating `document.documentElement`
 * directly in an effect, not by rendering the attribute from React state -
 * RootLayout's `<html>` JSX never sets `data-theme` itself, so there is
 * nothing for React to reconcile/warn about on hydration (unlike
 * className-driven state such as NavContext's, which does need
 * `suppressHydrationWarning`). The one accepted tradeoff: a user who
 * previously chose light/dark sees a brief flash of the OS-default theme
 * until this effect runs on first client paint - same "first render can't
 * know the client-only preference yet" tradeoff already accepted for the
 * sidebar's collapsed state.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'dark' | 'light'

type ThemeContextValue = {
  setTheme: (theme: ThemePref) => void
  theme: ThemePref
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'ac-theme'

function isThemePref(value: unknown): value is ThemePref {
  return value === 'light' || value === 'dark' || value === 'auto'
}

function getInitialTheme(): ThemePref {
  if (typeof window === 'undefined') return 'auto'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isThemePref(stored)) return stored
  } catch {
    // localStorage unavailable (private browsing, etc.) - default to auto.
  }
  return 'auto'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePref>(getInitialTheme)

  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme
    } else {
      document.documentElement.dataset.theme = theme
    }
  }, [theme])

  const setTheme = (next: ThemePref) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore - localStorage may be unavailable.
    }
  }

  return <ThemeContext.Provider value={{ setTheme, theme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
