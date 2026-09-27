'use client'

/**
 * From-scratch replacement for `@payloadcms/next`'s `DefaultTemplate`
 * `Wrapper` component (read directly from
 * `@payloadcms/next/dist/templates/Default/Wrapper/index.js` to match it
 * exactly). This is the CSS-grid wrapper stock `@payloadcms/next/css`
 * expects around the nav + main content: `.template-default{display:grid;
 * grid-template-columns:1fr auto;...}`, with `--nav-open`/`--nav-animate`/
 * `--nav-hydrated` modifier classes driving the actual column widths and nav
 * visibility (see that stylesheet's own rules for `.template-default--nav-
 * hydrated{grid-template-columns:0 auto}` / `--nav-open{grid-template-
 * columns:var(--nav-width) auto}`).
 *
 * RootLayout.tsx used to render <AdminNav/> and <main> as plain siblings of
 * <body> with no wrapper at all, so this stock CSS rule never matched -
 * <body> (display:block by default) stacked the full-100vh-tall nav ABOVE
 * the main content in normal block flow instead of laying them out side by
 * side. That's the confirmed root cause (proven live via getComputedStyle/
 * getBoundingClientRect on gracengatsby.com/admin) of both reported bugs:
 * admin pages looking unstyled/blank (real content was rendering ~838px
 * below the fold, under the full-height nav) and the off-canvas nav's own
 * content appearing to sit "above" the actual page content.
 */

import type { ReactNode } from 'react'
import React from 'react'
import { useNav } from '@/admin/context'

const baseClass = 'template-default'

export const TemplateDefaultWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { hydrated, navOpen, shouldAnimate } = useNav()

  const className = [
    baseClass,
    navOpen && `${baseClass}--nav-open`,
    shouldAnimate && `${baseClass}--nav-animate`,
    hydrated && `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    // Same `hydrated`/`navOpen` server-vs-client mismatch AdminNavShell's own
    // <aside> already documents (NavContext.tsx's header comment) - the
    // lazy-initializer values legitimately differ between the server render
    // and the client's first (hydrating) render, and without this the
    // mismatch went unpatched forever (confirmed live: React logs "This
    // won't be patched up" and the DOM keeps the server's pre-hydrated
    // classes, permanently hiding the nav behind `.template-default .nav
    // {display:none}` until a manual nav toggle forces a re-render).
    <div className={className} suppressHydrationWarning>
      {children}
    </div>
  )
}

export default TemplateDefaultWrapper
