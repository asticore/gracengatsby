import React from 'react'

import { getEngine } from '@/lib/engine'
import type { SiteSetting } from '@/engage-types'

/**
 * A bare root layout for pages meant to sit inside another website's iframe:
 * no header, footer, cookie banner, ads or analytics - just the site's theme
 * colours, so a form in an embed still looks like it belongs to this site.
 */
export const dynamic = 'force-dynamic'

export const metadata = { robots: { index: false, follow: false } }

const RADIUS_VALUES: Record<string, string> = { sharp: '0px', soft: '10px', round: '999px' }

// Only a plain colour is let into the style block; anything else is dropped.
const colour = (value: unknown): string | null =>
  typeof value === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\))$/.test(value.trim()) ? value.trim() : null

export default async function EmbedLayout({ children }: { children: React.ReactNode }) {
  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)) as SiteSetting | null
  const theme = settings?.theme
  const vars = [
    colour(theme?.primaryColor) ? `--color-ink: ${colour(theme?.primaryColor)};` : '',
    colour(theme?.accentColor) ? `--color-gold: ${colour(theme?.accentColor)};` : '',
    colour(theme?.backgroundColor) ? `--color-cream: ${colour(theme?.backgroundColor)};` : '',
    `--radius: ${RADIUS_VALUES[theme?.cornerStyle || 'soft'] || '10px'};`,
  ].join(' ')

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: `:root { ${vars} } body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: transparent; color: var(--color-ink, #1f2230); }` }} />
      </head>
      <body className="eg-embed-body">{children}</body>
    </html>
  )
}
