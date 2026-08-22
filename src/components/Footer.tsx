import Link from 'next/link'
import React from 'react'

type FooterLink = { href: string; label: string }
type FooterColumn = { title: string; links: FooterLink[] }
type SocialLink = { platform?: string | null; url?: string | null }

export const Footer: React.FC<{
  siteName?: string
  logoUrl?: string | null
  showLogo?: boolean
  bottomText?: string
  columns?: FooterColumn[]
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  socials?: { show?: boolean; links?: SocialLink[] | null } | null
  layout?: 'columns-3' | 'columns-4' | 'stacked'
  copyrightText?: string | null
}> = ({
  siteName = 'Grace & Gatsby',
  logoUrl,
  showLogo = true,
  bottomText = 'A curated boutique for the modern romantic - considered pieces, small-batch goods, and evenings worth dressing up for.',
  columns = [],
  contactEmail,
  contactPhone,
  address = 'Brisbane, Australia',
  socials,
  layout = 'columns-3',
  copyrightText,
}) => {
  const year = new Date().getFullYear()
  const socialLinks = (socials?.links || []).filter((link) => link.url)

  const contactColumn: FooterColumn = {
    title: 'Visit',
    links: [
      ...(address ? [{ href: '#', label: address }] : []),
      ...(contactEmail ? [{ href: `mailto:${contactEmail}`, label: contactEmail }] : []),
      ...(contactPhone ? [{ href: `tel:${contactPhone}`, label: contactPhone }] : []),
    ],
  }

  return (
    <footer className={`site-footer site-footer--${layout}`} id="about">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          {showLogo && logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="site-footer__logo-image" />
          ) : (
            <h2>{siteName}</h2>
          )}
          <p>{bottomText}</p>
          {socials?.show && socialLinks.length > 0 && (
            <div className="site-footer__social">
              {socialLinks.map((link, index) => (
                <a key={index} href={link.url || '#'} target="_blank" rel="noopener noreferrer">
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="site-footer__columns">
          {[...columns, contactColumn].map((column, index) => (
            <div key={index}>
              <h3>{column.title}</h3>
              {column.links.map((link, linkIndex) =>
                link.href === '#' ? (
                  <p key={linkIndex}>{link.label}</p>
                ) : (
                  <Link key={linkIndex} href={link.href}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="site-footer__bottom">
        <p>{copyrightText || `© ${year} ${siteName}. All rights reserved.`}</p>
      </div>
    </footer>
  )
}
