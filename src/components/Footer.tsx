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

  const columnsClass =
    layout === 'columns-4'
      ? 'grid grid-cols-4 gap-6 max-[900px]:grid-cols-2'
      : `grid grid-cols-3 gap-6 ${layout === 'stacked' ? 'justify-center' : ''}`

  return (
    <footer className="bg-[var(--color-ink)] px-6 pb-6 pt-16 text-[var(--color-cream)]" id="about">
      <div
        className={`mx-auto grid max-w-[var(--max-width)] grid-cols-[1.4fr_1fr] gap-12 max-[900px]:grid-cols-1 ${layout === 'stacked' ? 'text-center' : ''}`}
      >
        <div>
          {showLogo && logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="max-h-10 w-auto" />
          ) : (
            <h2 className="text-[1.75rem]">{siteName}</h2>
          )}
          <p className="max-w-[40ch] text-[rgba(246,241,231,0.7)]">{bottomText}</p>
          {socials?.show && socialLinks.length > 0 && (
            <div className="mt-4 flex gap-4">
              {socialLinks.map((link, index) => (
                <a
                  key={index}
                  href={link.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.75rem] uppercase tracking-[0.08em] text-[var(--color-gold-light)]"
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className={columnsClass}>
          {[...columns, contactColumn].map((column, index) => (
            <div key={index}>
              <h3 className="mb-3 font-[family-name:var(--font-body)] text-[0.75rem] uppercase tracking-[0.08em] text-[var(--color-gold-light)]">
                {column.title}
              </h3>
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

      <div className="mx-auto mt-12 max-w-[var(--max-width)] border-t border-[rgba(246,241,231,0.15)] pt-6 text-[0.8rem] text-[rgba(246,241,231,0.5)]">
        <p>{copyrightText || `© ${year} ${siteName}. All rights reserved.`}</p>
      </div>
    </footer>
  )
}
