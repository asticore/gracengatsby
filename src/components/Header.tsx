'use client'

import { useCart } from '@/engine/commerce/react'
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
      <img src={logoUrl} alt={siteName} className="max-h-10 w-auto" />
    ) : (
      siteName
    )

  return (
    <>
      {announcementBar?.enabled && announcementBar.text && !dismissed && (
        <div className="relative bg-[var(--color-ink)] px-10 py-2.5 text-center text-[0.8rem] tracking-[0.04em] text-[var(--color-cream)]">
          {announcementBar.linkUrl ? (
            <a href={announcementBar.linkUrl} className="text-[var(--color-gold-light)]">
              {announcementBar.text}
            </a>
          ) : (
            announcementBar.text
          )}
          {announcementBar.dismissible !== false && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-base text-inherit"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
            >
              &times;
            </button>
          )}
        </div>
      )}

      <header
        className={`z-20 border-b border-[var(--color-line)] bg-[var(--color-cream)] ${sticky ? 'sticky top-0' : 'static'}`}
      >
        <div
          className={`mx-auto flex max-w-[var(--max-width)] items-center px-6 py-5 ${desktopLayout === 'logo-center' ? 'justify-center gap-12' : 'justify-between'}`}
        >
          {desktopLayout === 'logo-right' ? (
            <>
              <HeaderNav links={links} onNavigate={() => setOpen(false)} />
              <Link href="/" className="font-[family-name:var(--font-display)] text-[1.6rem] font-semibold tracking-[0.02em]">
                {logo}
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className="font-[family-name:var(--font-display)] text-[1.6rem] font-semibold tracking-[0.02em]">
                {logo}
              </Link>
              <HeaderNav links={links} onNavigate={() => setOpen(false)} className={open ? 'is-open' : ''} mobileLayout={mobileLayout} />
            </>
          )}

          <div className="flex items-center gap-6">
            {socials?.show && socialLinks.length > 0 && (
              <div className="flex gap-3 text-[0.75rem] uppercase tracking-[0.06em]">
                {socialLinks.map((link, index) => (
                  <a key={index} href={link.url || '#'} target="_blank" rel="noopener noreferrer">
                    {link.platform}
                  </a>
                ))}
              </div>
            )}
            {showCart && (
              <Link
                href="/cart"
                className="relative text-[0.85rem] uppercase tracking-[0.08em]"
                aria-label="View cart"
              >
                Cart
                {itemCount > 0 && (
                  <span className="absolute -right-4 -top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--color-gold)] text-[0.65rem] text-[var(--color-ink)]">
                    {itemCount}
                  </span>
                )}
              </Link>
            )}
            <button
              type="button"
              className="flex flex-col gap-[5px] border-none bg-none cursor-pointer md:hidden"
              aria-label="Toggle navigation"
              onClick={() => setOpen((prev) => !prev)}
            >
              <span className="h-[1.5px] w-[22px] bg-[var(--color-ink)]" />
              <span className="h-[1.5px] w-[22px] bg-[var(--color-ink)]" />
              <span className="h-[1.5px] w-[22px] bg-[var(--color-ink)]" />
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
  <nav
    className={`site-header__nav site-header__nav--${mobileLayout} flex gap-8 text-[0.85rem] uppercase tracking-[0.08em] ${className}`}
  >
    {links.map((link) => (
      <div key={link.href} className="group relative inline-block">
        <Link
          href={link.href}
          target={link.newTab ? '_blank' : undefined}
          rel={link.newTab ? 'noopener noreferrer' : undefined}
          onClick={onNavigate}
        >
          {link.label}
        </Link>
        {link.children && link.children.length > 0 && (
          <div className="absolute left-0 top-full z-30 hidden min-w-[180px] border border-[var(--color-line)] bg-[var(--color-cream)] py-2 normal-case tracking-normal group-hover:block">
            {link.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                target={child.newTab ? '_blank' : undefined}
                rel={child.newTab ? 'noopener noreferrer' : undefined}
                onClick={onNavigate}
                className="block px-[18px] py-2.5"
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
