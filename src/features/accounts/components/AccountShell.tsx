import React from 'react'

import { AccountNav } from './AccountNav'
import { AccountStyles } from './styles'

/**
 * The frame around every signed-in screen, and the plainer one around the four
 * sign-in screens.
 *
 * The navigation lives here rather than in the site header because it only
 * exists inside the account area - which keeps the header, and the layout that
 * builds it, untouched by this feature. The nav itself is `AccountNav` (a
 * `'use client'` component, for its off-canvas-drawer toggle state on mobile -
 * added 2026-09-26, see that file's header comment) - this shell stays a
 * plain Server Component.
 */

const LINKS: { href: string; label: string }[] = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/store-credit', label: 'Store credit' },
  { href: '/account/subscriptions', label: 'Subscriptions' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/bookings', label: 'Event bookings' },
  { href: '/account/profile', label: 'Profile' },
]

/** The Organizations link shows only while that feature is switched on (Security settings). Any read failure hides it. */
const organizationsOn = async (): Promise<boolean> => {
  try {
    const [{ getEngine }, { getSecuritySettings }] = await Promise.all([import('@/lib/engine'), import('@/features/security/settings')])
    return (await getSecuritySettings((await getEngine()) as never)).organizations.enabled
  } catch {
    return false
  }
}

export const AccountShell = async ({
  title,
  current,
  children,
}: {
  title: string
  current: string
  children: React.ReactNode
}) => {
  const links = (await organizationsOn()) ? [...LINKS.slice(0, -1), { href: '/account/organizations', label: 'Organizations' }, LINKS[LINKS.length - 1]] : LINKS
  return (
    <div className="page-shell">
      <AccountStyles />
      <h1>{title}</h1>
      <div className="account">
        <AccountNav links={links} current={current} />
        <div className="account-panel">{children}</div>
      </div>
    </div>
  )
}

/** Sign in, register, forgotten password, reset - no navigation to show yet. */
export const AuthShell: React.FC<{ title: string; intro?: string; children: React.ReactNode }> = ({
  title,
  intro,
  children,
}) => (
  <div className="page-shell">
    <AccountStyles />
    <h1>{title}</h1>
    {intro ? <p>{intro}</p> : null}
    {children}
  </div>
)
