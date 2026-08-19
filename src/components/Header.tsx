'use client'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import Link from 'next/link'
import React, { useState } from 'react'

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/events', label: 'Events' },
  { href: '/#about', label: 'About' },
]

export const Header: React.FC = () => {
  const [open, setOpen] = useState(false)
  const { cart } = useCart()
  const itemCount = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo">
          Grace &amp; Gatsby
        </Link>

        <nav className={`site-header__nav ${open ? 'is-open' : ''}`}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
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
