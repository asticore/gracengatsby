'use client'

/**
 * From-scratch replacement for `the vendor package`'s `Logout`.
 *
 * Hits the already-implemented `POST /api/users/logout`, then sends the user
 * to `/admin/login` and refreshes so every server component (nav included)
 * re-reads the now-signed-out state.
 *
 * Stage 12: the label text is wrapped in its own `<span>` so custom.css can
 * hide it in the sidebar's collapsed rail state (`.nav--collapsed
 * .nav__log-out span`), leaving just the icon - `title`/`aria-label` keep it
 * reachable via tooltip and screen reader either way.
 */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

const LogoutIcon: React.FC = () => (
  <svg aria-hidden="true" height="15" viewBox="0 0 16 16" width="15">
    <path
      d="M6.5 1.5H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3.5M11 11.5 14.5 8 11 4.5M6.5 8h8"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
)

export const Logout: React.FC = () => {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const onClick = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/users/logout', { credentials: 'include', method: 'POST' })
    } finally {
      router.push('/admin/login')
      router.refresh()
    }
  }

  return (
    <button aria-label="Log out" className="nav__log-out" disabled={loggingOut} onClick={onClick} title="Log out" type="button">
      <LogoutIcon />
      <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
    </button>
  )
}

export default Logout
