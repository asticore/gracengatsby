'use client'

/**
 * Replaces TemplateDefaultWrapper.tsx (removed this rebuild) - that component
 * existed only to trigger `the vendor package`'s own `.template-default`
 * CSS-grid rules, which no longer exist now that stylesheet is gone (Stage
 * 12: full custom rebuild). This is the admin's own flex shell instead: the
 * sidebar (AdminNav's own `<aside>`, fixed/sticky-positioned - see
 * custom.css's `.nav`) sits beside `.admin-shell__main`, which is everything
 * else. `--collapsed`/`--hydrated` modifier classes let custom.css slide the
 * floating sidebar trigger (NavToggler.tsx) to sit just past the sidebar's
 * current width.
 */

import type { ReactNode } from 'react'
import React from 'react'
import { useNav } from '@/admin/context'

export const AdminShell: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { collapsed, hydrated } = useNav()

  const className = ['admin-shell', collapsed && 'admin-shell--collapsed', hydrated && 'admin-shell--hydrated']
    .filter(Boolean)
    .join(' ')

  return (
    // collapsed's initial value comes from localStorage, readable only on the
    // client - the server render always assumes expanded, same class of
    // mismatch NavContext.tsx's own doc comment already covers for
    // navOpen/isMobile.
    <div className={className} suppressHydrationWarning>
      {children}
    </div>
  )
}

export default AdminShell
