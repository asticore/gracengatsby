'use client'

/**
 * From-scratch replacement for `the vendor package`'s `NavGroup`.
 *
 * Simplification vs. the vendor's own version: the vendor persists each
 * group's open/closed state to the signed-in user's portal preferences
 * (`engine-preferences`) so it survives a reload. This version keeps it in
 * local component state only, seeded from the `isOpen` prop on first render.
 * Tracked in the plan doc as an intentional Phase-1 simplification - state
 * resets to `isOpen` on next login/reload instead of remembering the toggle.
 *
 * Stage 13 (WordPress-style collapsed rail): when the sidebar is in its
 * collapsed desktop-rail state, a group no longer dumps every one of its
 * entities flat into the rail (too many rows for ~50 entities across 5
 * groups - see the previous version of this file). Instead each group
 * collapses to ONE icon button (`NavGroupIcon`, keyed off the group label,
 * not per-entity - there is no per-entity icon set, see that file's own
 * comment), and hovering or focusing it reveals a `position: fixed` flyout
 * panel with the group's full entity list, labels and all - matching
 * https://wordpress.org/playground's own collapsed-admin-menu behavior.
 *
 * `position: fixed` (not `absolute`) is required here, not a style choice:
 * `.nav__scroll` (this component's actual DOM parent) has `overflow-y: auto`,
 * which per the CSS Overflow spec forces `overflow-x` to compute as `auto`
 * too even though it's never set explicitly - an `absolute` flyout would get
 * silently clipped at the rail's right edge. `fixed` escapes that clipping
 * entirely (its containing block is the viewport, not `.nav__scroll`) - safe
 * here because the rail only renders on desktop (`min-width: 769px`), where
 * `.nav` itself has no `transform` that would otherwise re-contain it (the
 * mobile off-canvas transform doesn't apply in this branch - see custom.css).
 *
 * The flyout's `<div>` is always mounted (never conditionally rendered) and
 * only its visibility toggles via a class - so a keyboard user tabbing onto
 * the trigger button (which opens it on focus) can continue tabbing straight
 * into the now-visible entity links, rather than hitting an empty DOM
 * subtree. Closing checks `e.relatedTarget` against the wrapper so moving
 * focus BETWEEN the trigger and its own flyout doesn't close it early.
 *
 * Known simplification: the flyout's position is computed once, when it
 * opens - if the sidebar's own scroll position changes while a flyout is
 * open (unlikely in the ~1s a pointer typically hovers), it will not
 * re-track. Not worth the extra scroll-listener plumbing for that edge case.
 */

import React, { useCallback, useRef, useState } from 'react'
import { useNav } from '@/admin/context'
import { NavGroupIcon } from './navGroupIcons'

export const NavGroup: React.FC<{
  children: React.ReactNode
  isOpen?: boolean
  label: string
}> = ({ children, isOpen, label }) => {
  const [open, setOpen] = useState(Boolean(isOpen))
  const { collapsed, isMobile } = useNav()
  const rail = collapsed && !isMobile

  const wrapRef = useRef<HTMLDivElement>(null)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutPos, setFlyoutPos] = useState({ left: 0, top: 0 })

  const showFlyout = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setFlyoutPos({ left: rect.right + 6, top: rect.top })
    setFlyoutOpen(true)
  }, [])

  const hideFlyout = useCallback(() => setFlyoutOpen(false), [])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (wrapRef.current && e.relatedTarget instanceof Node && wrapRef.current.contains(e.relatedTarget)) return
    setFlyoutOpen(false)
  }, [])

  if (rail) {
    return (
      <div className="nav-group nav-group--rail" onBlur={handleBlur} onMouseEnter={showFlyout} onMouseLeave={hideFlyout} ref={wrapRef}>
        <button aria-label={label} className="nav-group__rail-trigger" onFocus={showFlyout} type="button">
          <NavGroupIcon label={label} />
        </button>
        <div
          className={`nav-group__flyout${flyoutOpen ? ' nav-group__flyout--open' : ''}`}
          style={{ left: flyoutPos.left, top: flyoutPos.top }}
        >
          <div className="nav-group__flyout-label">{label}</div>
          <div className="nav-group__flyout-content">{children}</div>
        </div>
      </div>
    )
  }

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
