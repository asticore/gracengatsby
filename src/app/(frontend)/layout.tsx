import { Cinzel, Cormorant_Garamond, Inter, Jost, Montserrat, Playfair_Display } from 'next/font/google'
import React from 'react'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Providers } from '@/components/Providers'
import { getPayloadClient } from '@/lib/payload'
import type { Media, Page } from '@/payload-types'

import './styles.css'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant',
})
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-playfair',
})
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-cinzel',
})
const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost',
})
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-montserrat',
})
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
})

const HEADING_FONT_VARS: Record<string, string> = {
  cormorant: 'var(--font-cormorant)',
  playfair: 'var(--font-playfair)',
  cinzel: 'var(--font-cinzel)',
}

const BODY_FONT_VARS: Record<string, string> = {
  jost: 'var(--font-jost)',
  montserrat: 'var(--font-montserrat)',
  inter: 'var(--font-inter)',
}

export const metadata = {
  title: 'Grace & Gatsby',
  description:
    'Grace & Gatsby is a Brisbane boutique for considered style - shop the collection and see what is on.',
}

// The root layout now reads Site Settings/Navigation from the DB on every
// request (so menu/theme edits show up immediately). That means the whole
// app is request-rendered, not statically generated - force it explicitly so
// Next never tries to prerender any route at build time (which would fail on
// the Cloudflare build machine, which has no real DB/secret access).
export const dynamic = 'force-dynamic'

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const payload = await getPayloadClient()

  const [settings, navigation] = await Promise.all([
    payload.findGlobal({ slug: 'site-settings', depth: 2 }).catch((): null => null),
    payload.findGlobal({ slug: 'navigation', depth: 1 }).catch((): null => null),
  ])

  const logo = settings?.logo && typeof settings.logo === 'object' ? (settings.logo as Media) : null
  const theme = settings?.theme

  const navLinks = (navigation?.items || [])
    .map((item) => {
      const page = item.page && typeof item.page === 'object' ? (item.page as Page) : null
      const href = item.linkType === 'page' ? (page ? `/${page.slug}` : null) : item.customUrl
      if (!href || !item.label) return null
      return { href, label: item.label, newTab: Boolean(item.openInNewTab) }
    })
    .filter((link): link is { href: string; label: string; newTab: boolean } => Boolean(link))

  const themeVars = [
    theme?.primaryColor ? `--color-ink: ${theme.primaryColor};` : '',
    theme?.accentColor ? `--color-gold: ${theme.accentColor};` : '',
    theme?.backgroundColor ? `--color-cream: ${theme.backgroundColor};` : '',
    `--font-display: ${HEADING_FONT_VARS[theme?.headingFont || 'cormorant']};`,
    `--font-body: ${BODY_FONT_VARS[theme?.bodyFont || 'jost']};`,
  ].join(' ')

  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${playfair.variable} ${cinzel.variable} ${jost.variable} ${montserrat.variable} ${inter.variable}`}
    >
      <body>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${themeVars} }` }} />
        <Providers>
          {settings?.announcementBar && <div className="announcement-bar">{settings.announcementBar}</div>}
          <Header
            siteName={settings?.siteName || undefined}
            logoUrl={logo?.url || undefined}
            navLinks={navLinks}
          />
          <main>{children}</main>
          <Footer
            siteName={settings?.siteName || undefined}
            text={settings?.footer?.text || undefined}
            contactEmail={settings?.footer?.contactEmail}
            contactPhone={settings?.footer?.contactPhone}
            address={settings?.footer?.address || undefined}
            socialLinks={settings?.footer?.socialLinks}
          />
        </Providers>
      </body>
    </html>
  )
}
