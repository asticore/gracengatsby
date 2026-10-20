/**
 * Site facts for the Build with AI guide: name, tagline, theme colours and fonts.
 * Public design data only; no keys and no settings that are private. Never throws.
 */

import { getEngine } from '@/lib/engine'
import { loadThemeStyles } from '@/features/themeStyles/store'

import type { GuideContext } from './builderGuide'

const FONT_LABELS: Record<string, string> = {
  cormorant: 'Cormorant Garamond',
  playfair: 'Playfair Display',
  cinzel: 'Cinzel',
  jost: 'Jost',
  montserrat: 'Montserrat',
  inter: 'Inter',
}

const fontName = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return FONT_LABELS[value] ?? value
}

export async function readSiteContext(): Promise<Omit<GuideContext, 'mode'>> {
  const out: Omit<GuideContext, 'mode'> = {}
  try {
    const engine = await getEngine()
    const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)) as Record<string, unknown> | null
    if (typeof settings?.siteName === 'string') out.siteName = settings.siteName
    if (typeof settings?.tagline === 'string') out.tagline = settings.tagline
    const theme = (settings?.theme ?? {}) as Record<string, unknown>
    out.headingFont = fontName(theme.headingFont)
    out.bodyFont = fontName(theme.bodyFont)
  } catch {
    // Site settings are optional context.
  }
  try {
    const { styles, saved } = await loadThemeStyles()
    out.colours = styles.colours.map((c) => ({ id: c.id, value: c.value }))
    if (saved) {
      // Theme styles choose the fonts when saved; 'heading' and 'body' mean the site's two base fonts.
      const pick = (id: string): string | undefined => {
        const family = styles.typography.find((t) => t.id === id)?.fontFamily
        return family && family !== 'heading' && family !== 'body' ? fontName(family) : undefined
      }
      out.headingFont = pick('h1') ?? out.headingFont
      out.bodyFont = pick('body') ?? out.bodyFont
    }
  } catch {
    // No theme styles: the guide simply omits colours.
  }
  return out
}
