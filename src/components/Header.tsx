'use client'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import Link from 'next/link'
import React, { useState } from 'react'

export type NavLink = {
  href: string
  label: string
  newTab?: boolean
  children?: NavLink[]
}

const DEFAULT_LINKS: NavLink[] = [
  { href: '/shop', label: 'Shop' },
  { href: '/events', label: 'Events' },
  { href: '/#about', label: 'About' },
]

export const Header: React.FC<{
  siteName?: string
  logoUrl?: string | null
  showLogo?: boolean
  navLinks?: NavLink[]
  sticky?: boolean
  desktopLayout?: 'logo-left' | 'logo-center' | 'logo-right'
  mobileLayout?: 'slide-in' | 'fullscreen'
  showCart?: boolean
  announcementBar?: { enabled?: boolean; text?: string | null; linkUrl?: string | null; dismissible?: boolean | null } | null
  socials?: { show?: boolean; links?: { platform?: string | null; url?: string | null }[] | null } | null
}> = ({
  siteName = 'Grace & Gatsby',
  logoUrl,
  showLogo = true,
  navLinks,
  sticky = true,
  desktopLayout = 'logo-left',
  mobileLayout = 'slide-in',
  showCart = true,
  announcementBar,
  socials,
}) => {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const { cart } = useCart()
  const itemCount = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
  const links = navLinks && navLinks.length > 0 ? navLinks : DEFAULT_LINKS
  const socialLinks = (socials?.links || []).filter((link) => link.url)

  const logo =
    showLogo && logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={siteName} className="site-header__logo-image" />
    ) : (
      siteName
    )

  return (
    <>
      {announcementBar?.enabled && announcementBar.text && !dismissed && (
        <div className="announcement-bar">
          {announcementBar.linkUrl ? <a href={announcementBar.linkUrl}>{announcementBar.text}</a> : announcementBar.text}
          {announcementBar.dismissible !== false && (
            <button type="button" className="announcement-bar__dismiss" aria-label="Dismiss" onClick={() => setDismissed(true)}>
              &times;
            </button>
          )}
        </div>
      )}

      <header className={`site-header site-header--${desktopLayout} ${sticky ? 'is-sticky' : ''}`}>
        <div className="site-header__inner">
          {desktopLayout === 'logo-right' ? (
            <>
              <HeaderNav links={links} onNavigate={() => setOpen(false)} />
              <Link href="/" className="site-header__logo">
                {logo}
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className="site-header__logo">
                {logo}
              </Link>
              <HeaderNav links={links} onNavigate={() => setOpen(false)} className={open ? 'is-open' : ''} mobileLayout={mobileLayout} />
            </>
          )}

          <div className="site-header__actions">
            {socials?.show && socialLinks.length > 0 && (
              <div className="site-header__socials">
                {socialLinks.map((link, index) => (
                  <a key={index} href={link.url || '#'} target="_blank" rel="noopener noreferrer">
                    {link.platform}
                  </a>
                ))}
              </div>
            )}
            {showCart && (
              <Link href="/cart" className="site-header__cart" aria-label="View cart">
                Cart
                {itemCount > 0 && <span className="site-header__cart-count">{itemCount}</span>}
              </Link>
            )}
            <button
              type="button"
              className="site-header__toggle"
              aria-label="Toggle navigation"
              onClick={() => setOpen((prev) => !prev)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
    </>
  )
}

const HeaderNav: React.FC<{
  links: NavLink[]
  onNavigate: () => void
  className?: string
  mobileLayout?: 'slide-in' | 'fullscreen'
}> = ({ links, onNavigate, className = '', mobileLayout = 'slide-in' }) => (
  <nav className={`site-header__nav site-header__nav--${mobileLayout} ${className}`}>
    {links.map((link) => (
      <div key={link.href} className={`site-header__nav-item ${link.children?.length ? 'has-dropdown' : ''}`}>
        <Link
          href={link.href}
          target={link.newTab ? '_blank' : undefined}
          rel={link.newTab ? 'noopener noreferrer' : undefined}
          onClick={onNavigate}
        >
          {link.label}
        </Link>
        {link.children && link.children.length > 0 && (
          <div className="site-header__dropdown">
            {link.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                target={child.newTab ? '_blank' : undefined}
                rel={child.newTab ? 'noopener noreferrer' : undefined}
                onClick={onNavigate}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    ))}
  </nav>
)
