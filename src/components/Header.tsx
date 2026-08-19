'use client'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import Link from 'next/link'
import React, { useState } from 'react'

export type NavLink = { href: string; label: string; newTab?: boolean }

const DEFAULT_LINKS: NavLink[] = [
  { href: '/shop', label: 'Shop' },
  { href: '/events', label: 'Events' },
  { href: '/#about', label: 'About' },
]

export const Header: React.FC<{
  siteName?: string
  logoUrl?: string | null
  navLinks?: NavLink[]
}> = ({ siteName = 'Grace & Gatsby', logoUrl, navLinks }) => {
  const [open, setOpen] = useState(false)
  const { cart } = useCart()
  const itemCount = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
  const links = navLinks && navLinks.length > 0 ? navLinks : DEFAULT_LINKS

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="site-header__logo-image" />
          ) : (
            siteName
          )}
        </Link>

        <nav className={`site-header__nav ${open ? 'is-open' : ''}`}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target={link.newTab ? '_blank' : undefined}
              rel={link.newTab ? 'noopener noreferrer' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          <Link href="/cart" className="site-header__cart" aria-label="View cart">
            Cart
            {itemCount > 0 && <span className="site-header__cart-count">{itemCount}</span>}
          </Link>
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
  )
}
