'use client'

/**
 * Top-right color-scheme (light/dark/auto) switcher. See ThemeContext.tsx for
 * why the preference itself lives there rather than here. Positioned fixed
 * top-right (`.theme-toggler` in custom.css), mirroring NavToggler's fixed
 * top-left placement - the two never overlap.
 */

import React, { useCallback, useRef, useState } from 'react'
import { type ThemePref, useTheme } from '@/admin/context/ThemeContext'

const OPTIONS: { label: string; value: ThemePref }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'auto' },
]

const SunIcon: React.FC = () => (
  <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" viewBox="0 0 16 16" width="17">
    <circle cx="8" cy="8" r="2.6" />
    <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </svg>
)

const MoonIcon: React.FC = () => (
  <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="17">
    <path d="M13.8 9.8A6 6 0 0 1 6.2 2.2a6 6 0 1 0 7.6 7.6Z" />
  </svg>
)

const AutoIcon: React.FC = () => (
  <svg aria-hidden="true" fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="17">
    <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" />
    <path d="M5.5 14h5M8 11v3" />
  </svg>
)

export const ThemeToggler: React.FC = () => {
  const { setTheme, theme } = useTheme()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (wrapRef.current && e.relatedTarget instanceof Node && wrapRef.current.contains(e.relatedTarget)) return
    setOpen(false)
  }, [])

  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : AutoIcon

  return (
    <div className="theme-toggler" onBlur={handleBlur} ref={wrapRef}>
      <button aria-label="Color scheme" className="theme-toggler__trigger" onClick={() => setOpen((prev) => !prev)} title="Color scheme" type="button">
        <Icon />
      </button>
      {open && (
        <div className="theme-toggler__menu" role="menu">
          {OPTIONS.map((opt) => (
            <button
              className={`theme-toggler__option${theme === opt.value ? ' theme-toggler__option--active' : ''}`}
              key={opt.value}
              onClick={() => {
                setTheme(opt.value)
                setOpen(false)
              }}
              role="menuitem"
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ThemeToggler
