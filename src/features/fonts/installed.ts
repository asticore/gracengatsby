/**
 * Pure helpers for installed fonts: validation of everything that ends up in
 * CSS or in a URL, merge rules, file naming and font-format detection.
 *
 * Nothing here touches the network, the database or R2, so it runs in the
 * browser bundle, the Worker and the Node test runner alike.
 */
import type { FontSource, InstalledFont } from './types'

export const FONT_FAMILY_PATTERN = /^[A-Za-z0-9 -]{1,60}$/
export const FONT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/
export const ALLOWED_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export const MAX_INSTALLED_FONTS = 50
export const MAX_FONT_UPLOAD_BYTES = 2 * 1024 * 1024
/** Prefix of the public route that serves files stored in R2 (see src/localapi/rest.ts). */
export const LOCAL_FONT_PATH_PREFIX = '/api/media/file/'

const LOCAL_FILE_PATH = /^\/api\/media\/file\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/
const SAFE_URL_CHARS = /^[A-Za-z0-9\-._~:/?#&=%+@;,]+$/
const ALLOWED_REMOTE_HOSTS = ['fonts.googleapis.com', 'cdn.jsdelivr.net']
const FILE_KEY = /^(\d{3})-(normal|italic)$/

export const FONT_SOURCES: readonly FontSource[] = ['google', 'fontsource', 'upload']

/**
 * The fonts that ship with the theme. `value` is what the theme stores; `role`
 * says which picker lists it. `fontsourceId` lets the admin preview them.
 */
export const BUILT_IN_FONTS: ReadonlyArray<{
  value: string
  family: string
  label: string
  category: string
  role: 'heading' | 'body'
  fontsourceId: string
}> = [
  { value: 'cormorant', family: 'Cormorant Garamond', label: 'Cormorant Garamond (elegant serif)', category: 'serif', role: 'heading', fontsourceId: 'cormorant-garamond' },
  { value: 'playfair', family: 'Playfair Display', label: 'Playfair Display (bold serif)', category: 'serif', role: 'heading', fontsourceId: 'playfair-display' },
  { value: 'cinzel', family: 'Cinzel', label: 'Cinzel (Art Deco display)', category: 'serif', role: 'heading', fontsourceId: 'cinzel' },
  { value: 'jost', family: 'Jost', label: 'Jost (geometric sans)', category: 'sans-serif', role: 'body', fontsourceId: 'jost' },
  { value: 'montserrat', family: 'Montserrat', label: 'Montserrat', category: 'sans-serif', role: 'body', fontsourceId: 'montserrat' },
  { value: 'inter', family: 'Inter', label: 'Inter', category: 'sans-serif', role: 'body', fontsourceId: 'inter' },
]

/** Ids an installed font may not take, because the theme already knows them. */
export const RESERVED_FONT_IDS: readonly string[] = BUILT_IN_FONTS.map((font) => font.value)

export type FontFormat = 'woff2' | 'woff' | 'ttf'

export const FONT_FORMATS: Record<FontFormat, { mime: string; css: string }> = {
  woff2: { mime: 'font/woff2', css: 'woff2' },
  woff: { mime: 'font/woff', css: 'woff' },
  ttf: { mime: 'font/ttf', css: 'truetype' },
}

/** Returns the trimmed family name, or null when it is not a safe CSS family name. */
export function sanitizeFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return FONT_FAMILY_PATTERN.test(trimmed) ? trimmed : null
}

export function sanitizeFontId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return FONT_ID_PATTERN.test(trimmed) ? trimmed : null
}

/** Keeps only allowed weights, de-duplicated and sorted ascending. */
export function sanitizeWeights(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set<number>(ALLOWED_WEIGHTS)
  const out = new Set<number>()
  for (const entry of value) {
    const n = typeof entry === 'string' ? Number(entry) : entry
    if (typeof n === 'number' && allowed.has(n)) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

/**
 * Accepts a font file URL only when it is this site's own R2 route or an https
 * URL on an allow-listed host, with a character set that cannot break out of
 * a CSS `url("...")` or an HTML attribute.
 */
export function sanitizeFontUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null
  if (value.startsWith(LOCAL_FONT_PATH_PREFIX)) {
    return LOCAL_FILE_PATH.test(value) ? value : null
  }
  if (!SAFE_URL_CHARS.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  return ALLOWED_REMOTE_HOSTS.includes(url.hostname) ? value : null
}

/** Returns a font format from a file URL's extension, or null for anything else. */
export function fontFormatFromUrl(url: string): FontFormat | null {
  const path = url.split(/[?#]/)[0]
  if (path.endsWith('.woff2')) return 'woff2'
  if (path.endsWith('.woff')) return 'woff'
  if (path.endsWith('.ttf')) return 'ttf'
  return null
}

/**
 * Identifies a font file from its first bytes. Returns null for anything that
 * is not WOFF2, WOFF or TrueType, so an HTML or SVG upload never gets stored.
 */
export function detectFontFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 4) return null
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'ttf'
  if (tag === 'true') return 'ttf'
  return null
}

/** Lower-case slug of a family name, used to build ids for uploaded fonts. */
export function slugifyFamily(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Id given to an uploaded font, e.g. `upload-my-brand`. */
export function uploadFontId(family: string): string | null {
  const slug = slugifyFamily(family)
  return slug ? `upload-${slug}` : null
}

/**
 * Upload id that will not overwrite a different family already installed.
 * `taken` is the site's current installed fonts. The same family keeps its id,
 * so a second weight merges into it as before. A different family whose slug
 * collides gets the next free suffix: `upload-brand`, `upload-brand-2`, and so on.
 */
export function uniqueUploadFontId(family: string, taken: ReadonlyArray<Pick<InstalledFont, 'id' | 'family'>>): string | null {
  const base = uploadFontId(family)
  if (!base) return null
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const owner = taken.find((font) => font.id === candidate)
    if (!owner || owner.family === family) return candidate
  }
}

/** Flat R2 key for one locally stored font file. */
export function localFontFileName(id: string, weight: number, style: string, format: FontFormat): string {
  return `font-${id}-${weight}-${style}.${format}`
}

export function localFontUrl(fileName: string): string {
  return `${LOCAL_FONT_PATH_PREFIX}${fileName}`
}

/** Fills in a family's stack, falling back by category. Unsafe input yields a plain sans-serif. */
export function fontStack(family: string, category?: string): string {
  const safe = sanitizeFamily(family)
  if (!safe) return 'sans-serif'
  const fallback =
    category === 'monospace'
      ? 'ui-monospace, monospace'
      : category === 'serif'
        ? 'Georgia, serif'
        : category === 'handwriting' || category === 'cursive'
          ? 'cursive'
          : 'system-ui, sans-serif'
  return `"${safe}", ${fallback}`
}

/**
 * Validates a whole installed-fonts value. Accepts the array itself or its JSON
 * string, and silently drops any entry that would be unsafe to render.
 */
export function sanitizeInstalledFonts(value: unknown): InstalledFont[] {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []

  const out: InstalledFont[] = []
  const seen = new Set<string>()
  for (const entry of raw.slice(0, MAX_INSTALLED_FONTS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = sanitizeFontId(e.id)
    const family = sanitizeFamily(e.family)
    const source = FONT_SOURCES.find((s) => s === e.source)
    const weights = sanitizeWeights(e.weights)
    if (!id || !family || !source || weights.length === 0 || seen.has(id) || RESERVED_FONT_IDS.includes(id)) continue

    const files: Record<string, string> = {}
    if (e.files && typeof e.files === 'object') {
      for (const [key, url] of Object.entries(e.files as Record<string, unknown>)) {
        if (!FILE_KEY.test(key)) continue
        const safeUrl = sanitizeFontUrl(url)
        if (safeUrl) files[key] = safeUrl
      }
    }
    const local = e.local === true
    if (local && Object.keys(files).length === 0) continue

    const font: InstalledFont = { id, family, source, weights, italic: e.italic === true, local, files }
    if (typeof e.category === 'string' && e.category.length > 0 && e.category.length <= 40) font.category = e.category
    seen.add(id)
    out.push(font)
  }
  return out
}

/**
 * Adds or updates one font by id. Re-installing a font merges its weights and
 * files rather than replacing them, so uploading a second weight of the same
 * family keeps the first.
 */
export function mergeInstalledFont(current: InstalledFont[], incoming: InstalledFont): InstalledFont[] {
  const existing = current.find((font) => font.id === incoming.id)
  if (!existing) return [...current, incoming].slice(0, MAX_INSTALLED_FONTS)
  const merged: InstalledFont = {
    ...existing,
    ...incoming,
    weights: sanitizeWeights([...existing.weights, ...incoming.weights]),
    italic: existing.italic || incoming.italic,
    local: existing.local || incoming.local,
    files: { ...existing.files, ...incoming.files },
  }
  return current.map((font) => (font.id === incoming.id ? merged : font))
}

export function removeInstalledFont(current: InstalledFont[], id: string): InstalledFont[] {
  return current.filter((font) => font.id !== id)
}
