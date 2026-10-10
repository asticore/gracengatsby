/**
 * Pure CSS and link generation for installed fonts. Input is re-sanitised here
 * (sanitizeInstalledFonts is idempotent), so callers may pass a raw theme value.
 */
import { FONT_FORMATS, fontFormatFromUrl, fontStack, sanitizeInstalledFonts } from './installed'
import type { FontPreload, InstalledFont } from './types'

/** Subset requested from jsDelivr for remotely served Fontsource families. */
export const REMOTE_SUBSET = 'latin'

const FONTS_CSS_BASE = 'https://fonts.googleapis.com/css2'

export type ResolvedThemeFont = { stack: string; installed: InstalledFont | null }

/**
 * A heading/body value is either a built-in key (its CSS var, unchanged from
 * before custom fonts existed) or the id of a font the admin installed. Any
 * other value falls back to the built-in default rather than emitting
 * `undefined` into the CSS. Built-in lookups use own properties only, so a
 * value such as `constructor` cannot pick up an Object.prototype member.
 */
export function resolveThemeFont(
  value: string | null | undefined,
  builtIns: Record<string, string>,
  fallbackKey: string,
  installed: InstalledFont[],
): ResolvedThemeFont {
  const key = value || fallbackKey
  if (Object.hasOwn(builtIns, key)) return { stack: builtIns[key], installed: null }
  const font = installed.find((candidate) => candidate.id === key)
  if (font) return { stack: fontStack(font.family, font.category), installed: font }
  return { stack: builtIns[fallbackKey], installed: null }
}

/**
 * Google CSS2 stylesheet for one Google family, with every weight it was
 * installed at. An italic install asks for both upright and italic faces.
 * Google requires the `ital,wght` tuples in ascending order: every upright
 * `0,w` first, then every italic `1,w`, with no repeats.
 */
export function googleStylesheetUrl(font: InstalledFont): string {
  const family = font.family.replace(/ /g, '+')
  const weights = [...new Set(font.weights)].sort((a, b) => a - b)
  const axis = font.italic
    ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)].join(';')}`
    : `wght@${weights.join(';')}`
  return `${FONTS_CSS_BASE}?family=${family}:${axis}&display=swap`
}

/** jsDelivr file for one Fontsource weight/style, latin subset. */
export function fontsourceFileUrl(id: string, weight: number, style: string): string {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${REMOTE_SUBSET}-${weight}-${style}.woff2`
}

/**
 * Stylesheets to link for fonts served remotely by Google. Local and upload
 * fonts never need one, and Fontsource fonts load their files directly.
 */
export function remoteStylesheetUrls(fonts: readonly InstalledFont[]): string[] {
  const urls = sanitizeInstalledFonts(fonts)
    .filter((font) => font.source === 'google' && !font.local)
    .map(googleStylesheetUrl)
  return [...new Set(urls)]
}

function fontFace(family: string, weight: number, style: string, url: string, format: string): string {
  return `@font-face { font-family: "${family}"; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url("${url}") format("${format}"); }`
}

/**
 * @font-face rules for every installed font that is not served by a Google
 * stylesheet: local and upload files use their own URLs, and Fontsource fonts
 * use jsDelivr files for each chosen weight.
 */
export function buildFontCss(fonts: readonly InstalledFont[]): string {
  const rules: string[] = []
  for (const font of sanitizeInstalledFonts(fonts)) {
    if (font.local || font.source === 'upload') {
      for (const [key, url] of Object.entries(font.files)) {
        const [weight, style] = key.split('-')
        const format = fontFormatFromUrl(url) ?? 'woff2'
        rules.push(fontFace(font.family, Number(weight), style, url, FONT_FORMATS[format].css))
      }
    } else if (font.source === 'fontsource') {
      const styles = font.italic ? ['normal', 'italic'] : ['normal']
      for (const weight of font.weights) {
        for (const style of styles) {
          const url = fontsourceFileUrl(font.id, weight, style)
          rules.push(fontFace(font.family, weight, style, url, 'woff2'))
        }
      }
    }
  }
  return rules.join('\n')
}

/**
 * `<link rel="preload">` entries for the local and upload files of the families
 * actually used as heading or body. Only upright files are preloaded, one per
 * chosen weight, so an italic that is installed but unused costs nothing.
 */
export function preloadLinks(fonts: readonly InstalledFont[], usedFamilies: readonly string[]): FontPreload[] {
  const used = new Set(usedFamilies)
  const out: FontPreload[] = []
  const seen = new Set<string>()
  for (const font of sanitizeInstalledFonts(fonts)) {
    if (!(font.local || font.source === 'upload') || !used.has(font.family)) continue
    for (const [key, url] of Object.entries(font.files)) {
      if (!key.endsWith('-normal') || seen.has(url)) continue
      const format = fontFormatFromUrl(url) ?? 'woff2'
      seen.add(url)
      out.push({ href: url, type: FONT_FORMATS[format].mime })
    }
  }
  return out
}
