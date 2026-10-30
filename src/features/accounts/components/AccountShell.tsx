import React from 'react'

import type { PortalStringKey } from '@/features/multilingual/portalStrings'

import { accountTexts } from '../portalCopy'
import { AccountNav } from './AccountNav'
import { PortalSearch } from './PortalSearch'
import { PortalTextProvider } from './PortalText'
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
 *
 * Both shells load the visitor's translated strings and hand them to the client
 * components below through `PortalTextProvider`.
 */

const LINKS: { href: string; key: PortalStringKey }[] = [
  { href: '/account', key: 'nav.overview' },
  { href: '/account/orders', key: 'nav.orders' },
  { href: '/account/store-credit', key: 'nav.storeCredit' },
  { href: '/account/subscriptions', key: 'nav.subscriptions' },
  { href: '/account/addresses', key: 'nav.addresses' },
  { href: '/account/bookings', key: 'nav.bookings' },
  { href: '/account/profile', key: 'nav.profile' },
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
  const tx = await accountTexts()
  const entries = (await organizationsOn())
    ? [...LINKS.slice(0, -1), { href: '/account/organizations', key: 'nav.organizations' as const }, LINKS[LINKS.length - 1]]
    : LINKS
  const links = entries.map((entry) => ({ href: entry.href, label: tx(entry.key) }))
  return (
    <PortalTextProvider strings={tx.dictionary}>
      <div className="page-shell">
        <AccountStyles />
        <h1>{title}</h1>
        <PortalSearch links={links} />
        <div className="account">
          <AccountNav links={links} current={current} />
          <div className="account-panel">{children}</div>
        </div>
      </div>
    </PortalTextProvider>
  )
}

/** Sign in, register, forgotten password, reset - no navigation to show yet. */
export const AuthShell: React.FC<{ title: string; intro?: string; children: React.ReactNode }> = async ({
  title,
  intro,
  children,
}) => {
  const tx = await accountTexts()
  return (
    <PortalTextProvider strings={tx.dictionary}>
      <div className="page-shell">
        <AccountStyles />
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
        {children}
      </div>
    </PortalTextProvider>
  )
}
