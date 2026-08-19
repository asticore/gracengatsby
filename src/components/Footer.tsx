import Link from 'next/link'
import React from 'react'

type SocialLink = { platform?: string | null; url?: string | null }

export const Footer: React.FC<{
  siteName?: string
  text?: string
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  socialLinks?: SocialLink[] | null
}> = ({
  siteName = 'Grace & Gatsby',
  text = 'A curated boutique for the modern romantic - considered pieces, small-batch goods, and evenings worth dressing up for.',
  contactEmail,
  contactPhone,
  address = 'Brisbane, Australia',
  socialLinks,
}) => {
  const year = new Date().getFullYear()
  const links = (socialLinks || []).filter((link) => link.url)

  return (
    <footer className="site-footer" id="about">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <h2>{siteName}</h2>
          <p>{text}</p>
          {links.length > 0 && (
            <div className="site-footer__social">
              {links.map((link, index) => (
                <a key={index} href={link.url || '#'} target="_blank" rel="noopener noreferrer">
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="site-footer__columns">
          <div>
            <h3>Shop</h3>
            <Link href="/shop">All products</Link>
          </div>
          <div>
            <h3>Events</h3>
            <Link href="/events">What&apos;s on</Link>
          </div>
          <div>
            <h3>Visit</h3>
            <p>{address}</p>
            {contactEmail && (
              <p>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </p>
            )}
            {contactPhone && (
              <p>
                <a href={`tel:${contactPhone}`}>{contactPhone}</a>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="site-footer__bottom">
        <p>
          &copy; {year} {siteName}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
