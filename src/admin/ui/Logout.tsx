'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s `Logout`.
 *
 * Hits the already-implemented `POST /api/users/logout`, then sends the user
 * to `/admin/login` and refreshes so every server component (nav included)
 * re-reads the now-signed-out state.
 */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    <button className="nav__log-out" disabled={loggingOut} onClick={onClick} type="button">
      {loggingOut ? 'Logging out…' : 'Log out'}
    </button>
  )
}

export default Logout
