import React from 'react'

import './sidebars.css'

/**
 * Places the left and right sidebar templates beside the page's main content. With neither sidebar it returns
 * the content unchanged, so a site without sidebars renders exactly as before.
 */
export function SidebarLayout({ left, right, children }: { left: React.ReactNode | null; right: React.ReactNode | null; children?: React.ReactNode }) {
  if (!left && !right) return <>{children}</>
  return (
    <div className="eg-sidebars">
      {left ? (
        <aside className="eg-sidebar eg-sidebar--left" data-sidebar="left">
          {left}
        </aside>
      ) : null}
      <div className="eg-sidebars__main">{children}</div>
      {right ? (
        <aside className="eg-sidebar eg-sidebar--right" data-sidebar="right">
          {right}
        </aside>
      ) : null}
    </div>
  )
}
