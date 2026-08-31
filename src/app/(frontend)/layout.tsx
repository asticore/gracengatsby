import { Cinzel, Cormorant_Garamond, Inter, Jost, Montserrat, Playfair_Display } from 'next/font/google'
import React from 'react'

import { Footer } from '@/components/Footer'
import { Header, type NavLink } from '@/components/Header'
import { Providers } from '@/components/Providers'
import { getEngine } from '@/lib/engine'
import { getAllResolvedPages, type ResolvedPage } from '@/utilities/pagePaths'
import type { Media } from '@/engage-types'

import { SeoBodyScripts, SeoJsonLd, SeoScripts } from '@/features/seo'
import { SpeedHead } from '@/features/speed'

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

const RADIUS_VALUES: Record<string, string> = {
  sharp: '0px',
  soft: '10px',
  round: '999px',
}

// Titles, descriptions, canonicals, Open Graph and the rest now come from the
// SEO settings rather than being fixed here - see features/seo.
export { generateSeoMetadata as generateMetadata } from '@/features/seo'

// The root layout reads Header/Footer/Site Settings from the DB on every
// request (so menu/theme edits show up immediately, no rebuild). That means
// the whole app is request-rendered, not statically generated - force it
// explicitly so Next never tries to prerender any route at build time (which
// would fail on the Cloudflare build machine, which has no real DB/secret
// access).
export const dynamic = 'force-dynamic'

type LinkSource = { label?: string | null; linkType?: string | null; page?: unknown; customUrl?: string | null; openInNewTab?: boolean | null }

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const engine = await getEngine()

  const [settings, header, footer, resolvedPages] = await Promise.all([
    engine.findGlobal({ slug: 'site-settings', depth: 1 }).catch((): null => null),
    engine.findGlobal({ slug: 'header', depth: 1 }).catch((): null => null),
    engine.findGlobal({ slug: 'footer', depth: 1 }).catch((): null => null),
    getAllResolvedPages().catch((): ResolvedPage[] => []),
  ])

  const pathById = new Map(resolvedPages.map((entry) => [String(entry.page.id), entry]))

  const resolveHref = (item: LinkSource): string | null => {
    if (item.linkType === 'page') {
      const pageId = item.page && typeof item.page === 'object' ? (item.page as { id?: unknown }).id : item.page
      if (!pageId) return null
      const entry = pathById.get(String(pageId))
      if (!entry) return null
      return entry.page.isHomepage ? '/' : `/${entry.path.join('/')}`
    }
    return item.customUrl || null
  }

  const features = settings?.features
  const disabledPrefixes = [
    features?.ecommerce === false ? '/shop' : null,
    features?.ecommerce === false ? '/cart' : null,
    features?.events === false ? '/events' : null,
    features?.blog === false ? '/blog' : null,
    features?.faq === false ? '/faq' : null,
  ].filter((v): v is string => Boolean(v))

  const isAllowed = (href: string) => !disabledPrefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))

  const buildLinks = (items: LinkSource[] | null | undefined): NavLink[] =>
    (items || [])
      .map((item): NavLink | null => {
        const href = resolveHref(item)
        if (!href || !item.label || !isAllowed(href)) return null
        const children = buildLinks((item as { children?: LinkSource[] }).children)
        return { href, label: item.label, newTab: Boolean(item.openInNewTab), children: children.length ? children : undefined }
      })
      .filter((link): link is NavLink => Boolean(link))

  const navLinks = buildLinks(header?.menu)


  // The account area adds one header link of its own, only while it is on.

  if (features?.accounts) navLinks.push({ href: '/account', label: 'Account' })
  const footerColumns = (footer?.columns || []).map((column) => ({
    title: column.title,
    links: buildLinks(column.links).map((l) => ({ href: l.href, label: l.label })),
  }))

  const logo = settings?.logo && typeof settings.logo === 'object' ? (settings.logo as Media) : null
  const theme = settings?.theme

  const themeVars = [
    theme?.primaryColor ? `--color-ink: ${theme.primaryColor};` : '',
    theme?.accentColor ? `--color-gold: ${theme.accentColor};` : '',
    theme?.backgroundColor ? `--color-cream: ${theme.backgroundColor};` : '',
    `--font-display: ${HEADING_FONT_VARS[theme?.headingFont || 'cormorant']};`,
    `--font-body: ${BODY_FONT_VARS[theme?.bodyFont || 'jost']};`,
    `--radius: ${RADIUS_VALUES[theme?.cornerStyle || 'soft']};`,
  ].join(' ')

  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${playfair.variable} ${cinzel.variable} ${jost.variable} ${montserrat.variable} ${inter.variable}`}
      data-btn={theme?.buttonStyle || 'solid'}
      data-hover={theme?.hoverEffect || 'fade'}
    >
      <head>
        <SpeedHead />
      </head>
      <body>
        <SeoScripts />
        <SeoJsonLd />
        <style dangerouslySetInnerHTML={{ __html: `:root { ${themeVars} }` }} />
        <Providers>
          <Header
            siteName={settings?.siteName || undefined}
            logoUrl={logo?.url || undefined}
            showLogo={header?.showLogo !== false}
            navLinks={navLinks}
            sticky={header?.sticky !== false}
            desktopLayout={(header?.desktopLayout as 'logo-left' | 'logo-center' | 'logo-right') || 'logo-left'}
            mobileLayout={(header?.mobileLayout as 'slide-in' | 'fullscreen') || 'slide-in'}
            showCart={features?.ecommerce !== false && header?.showCart !== false}
            announcementBar={header?.announcementBar}
            socials={header?.socials}
          />
          <main>{children}</main>
          <Footer
            siteName={settings?.siteName || undefined}
            logoUrl={logo?.url || undefined}
            showLogo={footer?.showLogo !== false}
            bottomText={footer?.bottomText || undefined}
            columns={footerColumns}
            contactEmail={footer?.contact?.email}
            contactPhone={footer?.contact?.phone}
            address={footer?.contact?.address || undefined}
            socials={footer?.socials}
            layout={(footer?.layout as 'columns-3' | 'columns-4' | 'stacked') || 'columns-3'}
            copyrightText={footer?.copyrightText}
          />
        </Providers>
        <SeoBodyScripts />
      </body>
    </html>
  )
}
