import type { SocialPost } from './types'

/** Longest caption kept on a post. */
export const CAPTION_MAX = 220
export const MAX_POSTS = 24

const ELLIPSIS = String.fromCharCode(8230)

export const truncate = (value: string, max = CAPTION_MAX): string => {
  const s = value.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + ELLIPSIS
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === '#') {
      const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[g.toLowerCase()] ?? m
  })

export const stripHtml = (s: string): string => decodeEntities(s.replace(/<[^>]*>/g, ' '))

export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** A public http(s) URL, or ''. */
export const safeHttpUrl = (v: unknown): string => {
  try {
    const u = new URL(str(v))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : ''
  } catch {
    return ''
  }
}

export const isoDate = (v: unknown): string => {
  const n = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(str(v))
  const d = new Date(n)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

export function parseJson(body: string): Record<string, unknown> {
  try {
    const v = JSON.parse(body) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Text of the first <tag>...</tag> in a chunk (namespaces allowed in `tag`), CDATA unwrapped. */
export function xmlText(chunk: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(chunk)
  if (!m) return ''
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim()
}

/** An attribute of the first <tag ...> in a chunk. */
export function xmlAttr(chunk: string, tag: string, attr: string): string {
  const m = new RegExp(`<${tag}(\\s[^>]*?)/?>`, 'i').exec(chunk)
  if (!m) return ''
  const a = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(m[1])
  return a ? decodeEntities(a[2] ?? a[3] ?? '') : ''
}

export function xmlBlocks(xml: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) && out.length < 100) out.push(m[1])
  return out
}

/** Atom/RSS entries to posts. Used by the YouTube and generic feed adapters. */
export function parseFeed(xml: string): SocialPost[] {
  const atom = xmlBlocks(xml, 'entry')
  const entries = atom.length ? atom : xmlBlocks(xml, 'item')
  const posts: SocialPost[] = []
  for (const e of entries) {
    const linkAtom = /<link\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/i.exec(e)
    const url = safeHttpUrl(decodeEntities(linkAtom ? (linkAtom[2] ?? linkAtom[3] ?? '') : xmlText(e, 'link')))
    if (!url) continue
    const title = stripHtml(xmlText(e, 'title'))
    const summary = stripHtml(xmlText(e, 'media:description') || xmlText(e, 'description') || xmlText(e, 'summary') || xmlText(e, 'content:encoded') || xmlText(e, 'content'))
    const rawHtml = decodeEntities(xmlText(e, 'content:encoded') || xmlText(e, 'description') || xmlText(e, 'content') || xmlText(e, 'summary'))
    const img =
      xmlAttr(e, 'media:thumbnail', 'url') ||
      xmlAttr(e, 'media:content', 'url') ||
      (/image/i.test(xmlAttr(e, 'enclosure', 'type')) ? xmlAttr(e, 'enclosure', 'url') : '') ||
      (/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(rawHtml)?.[1] ?? '')
    posts.push({
      id: str(xmlText(e, 'id') || xmlText(e, 'guid') || url),
      url,
      imageUrl: safeHttpUrl(decodeEntities(img)),
      caption: truncate(title && summary && summary !== title ? `${title} - ${summary}` : title || summary),
      date: isoDate(xmlText(e, 'published') || xmlText(e, 'updated') || xmlText(e, 'pubDate') || xmlText(e, 'dc:date')),
      likes: null,
      video: false,
    })
  }
  return posts
}
