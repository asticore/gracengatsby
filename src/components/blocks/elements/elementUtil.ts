import { safeUrl } from '@/lib/mergeTags'

import { ICON_NAMES } from './icons'

const ICON_SET = new Set(ICON_NAMES)

/**
 * A stored built-in icon name. Accepts the plain string the picker saves ("star") or an {icon} object holding one.
 * Returns '' for anything that is not in the built-in set, so callers can fall back to their own default glyph.
 */
export function iconName(v: unknown): string {
  const raw = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as { icon?: unknown }).icon : undefined
  const name = typeof raw === 'string' ? raw.trim() : ''
  return ICON_SET.has(name) ? name : ''
}

/** A media item as renderers need it. The canvas and the live site both resolve stored ids to this shape. */
export type MediaRef = { id?: number; url?: string | null; alt?: string | null }

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback)

export const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Checkbox values: stored as booleans, but tolerate the strings a hand-edited JSON might hold. */
export const flag = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback)

export const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback)

const LITERAL_COLOUR = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/+-]+\))$/i
/** A theme colour token. The id is limited to a-z0-9-_ so nothing else can ride inside the var(). */
const TOKEN_COLOUR = /^var\(--eg-c-[a-z0-9_-]+\)$/

/** A colour the CSS can take as-is: hex, rgb(a), hsl(a) or a theme token var(--eg-c-<id>). Anything else is ''. */
export function cssColour(v: unknown): string {
  const s = str(v).trim()
  return LITERAL_COLOUR.test(s) || TOKEN_COLOUR.test(s) ? s : ''
}

/** A link prop: a plain URL string (legacy) or the {url, newTab, nofollow} object the link field stores. */
export type LinkProp = { url?: string; newTab?: boolean; nofollow?: boolean }

/** The safe href for a link prop, or '' when there is none or its scheme is refused (javascript:, data:, ...). */
export function linkHref(v: unknown): string {
  const raw = typeof v === 'string' ? v : v && typeof v === 'object' ? (v as LinkProp).url : undefined
  return safeUrl(raw) ?? ''
}

/** target and rel for a link prop. New tab adds noopener noreferrer, nofollow adds nofollow. Plain strings carry neither. */
export function linkAttrs(v: unknown): { target?: '_blank'; rel?: string } {
  if (!v || typeof v !== 'object') return {}
  const l = v as LinkProp
  const newTab = flag(l.newTab)
  const rel = [newTab ? 'noopener noreferrer' : '', flag(l.nofollow) ? 'nofollow' : ''].filter(Boolean).join(' ')
  const out: { target?: '_blank'; rel?: string } = {}
  if (newTab) out.target = '_blank'
  if (rel) out.rel = rel
  return out
}

/** Repeater rows are stored as objects; the first string/number value of a row is its "main" text. */
function rowText(row: unknown): string {
  if (typeof row === 'string' || typeof row === 'number') return String(row)
  if (row && typeof row === 'object') {
    const r = row as Record<string, unknown>
    if (typeof r.text === 'string') return r.text
    for (const v of Object.values(r)) if (typeof v === 'string' || typeof v === 'number') return String(v)
  }
  return ''
}

/** One item per non-empty line. Also accepts a repeater array (one item per row). */
export function lines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((r) => rowText(r).trim()).filter(Boolean)
  return str(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** "a | b | c" per line, split into trimmed cells. The first `maxCells - 1` separators split; the rest stays in the last cell. */
export function cells(v: unknown, maxCells = 3): string[][] {
  if (Array.isArray(v)) {
    // Repeater rows: one object per row, cells are its values in field order.
    return v
      .map((row) => {
        if (row && typeof row === 'object') {
          const vals = Object.values(row as Record<string, unknown>).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''))
          return vals.slice(0, maxCells)
        }
        return [String(row ?? '').trim()]
      })
      .filter((r) => r.some(Boolean))
  }
  return lines(v).map((line) => {
    const parts: string[] = []
    let rest = line
    while (parts.length < maxCells - 1) {
      const i = rest.indexOf('|')
      if (i < 0) break
      parts.push(rest.slice(0, i).trim())
      rest = rest.slice(i + 1)
    }
    parts.push(rest.trim())
    return parts
  })
}

/** A media prop (resolved object, id or plain URL string) to something renderable, or null. Bare ids cannot be rendered. */
export function mediaOf(v: unknown): MediaRef | null {
  if (!v) return null
  if (typeof v === 'string') {
    const url = safeUrl(v)
    return url ? { url } : null
  }
  if (typeof v === 'object') {
    const m = v as MediaRef
    const url = safeUrl(m.url)
    return url ? { id: m.id, url, alt: m.alt } : null
  }
  return null
}

export function mediaListOf(v: unknown, urlLines?: unknown): MediaRef[] {
  const out: MediaRef[] = []
  if (Array.isArray(v)) for (const item of v) {
    const m = mediaOf(item)
    if (m) out.push(m)
  }
  for (const [url, alt] of cells(urlLines, 2)) {
    const safe = safeUrl(url)
    if (safe) out.push({ url: safe, alt })
  }
  return out
}

/** Media ids (numbers) found in a props object, for the resolvers. */
export function collectMediaIds(props: Record<string, unknown>, keys: readonly string[]): number[] {
  const ids: number[] = []
  for (const key of keys) {
    const v = props[key]
    for (const item of Array.isArray(v) ? v : [v]) {
      if (typeof item === 'number' && Number.isInteger(item) && item > 0) ids.push(item)
    }
  }
  return Array.from(new Set(ids))
}

/** Replaces numeric media ids in the given keys with their resolved docs (unknown ids stay as they are). */
export function substituteMedia(props: Record<string, unknown>, keys: readonly string[], docs: Map<number, MediaRef>): Record<string, unknown> {
  const swap = (x: unknown) => (typeof x === 'number' && docs.has(x) ? docs.get(x) : x)
  const out = { ...props }
  for (const key of keys) {
    const v = props[key]
    if (v !== undefined) out[key] = Array.isArray(v) ? v.map(swap) : swap(v)
  }
  return out
}

/** The props keys that hold media, per element type. Used by both resolvers. */
export const MEDIA_PROP_KEYS: Record<string, readonly string[]> = {
  image: ['image'],
  'image-box': ['image'],
  'image-gallery': ['images'],
  'image-carousel': ['images'],
  'logo-strip': ['images'],
  gallery: ['images'],
  testimonial: ['photo'],
  'team-member': ['photo'],
  'flip-box': ['image'],
  card: ['image'],
  'image-comparison': ['before', 'after'],
  hotspots: ['image'],
}

/* ---------- video ---------- */

export type VideoSource = { kind: 'youtube' | 'vimeo' | 'file'; src: string }

/** Turns a pasted video URL into a safe embed source. YouTube uses the no-cookie host, Vimeo gets do-not-track. */
export function parseVideoUrl(raw: unknown): VideoSource | null {
  const text = str(raw).trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  const idOk = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null)
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id: string | null = null
    if (host === 'youtu.be') id = idOk(url.pathname.slice(1).split('/')[0])
    else if (url.pathname === '/watch') id = idOk(url.searchParams.get('v'))
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)
      id = idOk(m?.[1])
    }
    return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/)
    return m ? { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}?dnt=1` } : null
  }
  if (/\.(mp4|webm|ogv|ogg)$/i.test(url.pathname)) return { kind: 'file', src: url.toString() }
  return null
}

/* ---------- map ---------- */

/**
 * An iframe src for a map. A "lat,lng" pair uses OpenStreetMap; free text uses Google's keyless embed. A pasted
 * URL is only honoured for allow-listed map hosts; anything else falls back to the address (or null).
 */
export function mapEmbedSrc(address: unknown, embedUrl?: unknown, zoom = 14): string | null {
  const given = str(embedUrl).trim()
  if (given) {
    try {
      const u = new URL(given)
      const host = u.hostname.replace(/^www\./, '')
      const okGoogle = u.protocol === 'https:' && host === 'google.com' && u.pathname.startsWith('/maps')
      const okOsm = u.protocol === 'https:' && host === 'openstreetmap.org' && u.pathname.startsWith('/export/embed')
      if (okGoogle || okOsm) return u.toString()
    } catch {
      /* fall through to the address */
    }
  }
  const text = str(address).trim()
  if (!text) return null
  const ll = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (ll) {
    const lat = Number(ll[1])
    const lng = Number(ll[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const d = 0.02 * Math.pow(2, 14 - Math.min(Math.max(zoom, 1), 20))
      const bbox = [lng - d, lat - d / 2, lng + d, lat + d / 2].map((n) => n.toFixed(5)).join(',')
      return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
    }
    return null
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(text.slice(0, 200))}&z=${Math.round(Math.min(Math.max(zoom, 1), 20))}&output=embed`
}

/* ---------- html sanitiser ---------- */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'class', 'id', 'width', 'height', 'target', 'rel', 'colspan', 'rowspan', 'role', 'lang', 'dir'])
const URL_ATTRS = new Set(['href', 'src'])
/** Tags removed together with everything inside them. */
const DROP_WITH_CONTENT = 'script|style|iframe|frame|frameset|object|embed|applet|noscript|template|svg|math|title|textarea|select|option|button|form|head|link|meta|base|audio|video|source|canvas'

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function parseAttrs(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ''])
  return out
}

/**
 * Allow-list HTML sanitiser for the `html` element. Keeps basic content tags and a short list of attributes;
 * drops script/style/iframe/object/form and friends (with their content), every on* handler, style attributes,
 * and any href/src that is not http(s), mailto, tel, a root-relative path or an anchor. Unknown tags are
 * unwrapped (their text stays). Not a general-purpose sanitiser: it exists so admin-authored snippets cannot
 * run script on the live site.
 */
export function sanitizeHtml(input: unknown): string {
  let html = str(input).slice(0, 100_000)
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!--[\s\S]*$/, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?\?>/g, '')
  const drop = new RegExp(`<(${DROP_WITH_CONTENT})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi')
  for (let i = 0; i < 10; i++) {
    const next = html.replace(drop, '')
    if (next === html) break
    html = next
  }
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  const text = (s: string) => s.replace(/</g, '&lt;')
  while ((m = tagRe.exec(html))) {
    out += text(html.slice(last, m.index))
    last = m.index + m[0].length
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) continue
    if (closing) {
      if (!VOID_TAGS.has(tag)) out += `</${tag}>`
      continue
    }
    let attrs = ''
    for (const [name, value] of parseAttrs(m[3])) {
      if (!ALLOWED_ATTRS.has(name)) continue
      if (URL_ATTRS.has(name)) {
        const safe = safeUrl(value.replace(/&#?\w+;/g, (e) => decodeEntity(e)))
        if (!safe) continue
        attrs += ` ${name}="${escapeAttr(safe)}"`
      } else {
        attrs += ` ${name}="${escapeAttr(value)}"`
      }
    }
    if (tag === 'a' && /\starget="_blank"/.test(attrs)) attrs = attrs.replace(/\srel="[^"]*"/, '') + ' rel="noopener noreferrer"'
    out += `<${tag}${attrs}>`
  }
  // Text after the last tag; the unterminated "<x" a browser would swallow becomes visible text instead.
  out += text(html.slice(last))
  return out
}

function decodeEntity(entity: string): string {
  const named: Record<string, string> = { '&colon;': ':', '&tab;': '', '&newline;': '', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
  const lower = entity.toLowerCase()
  if (named[lower] !== undefined) return named[lower]
  const hex = lower.match(/^&#x([0-9a-f]+);$/)
  const dec = lower.match(/^&#(\d+);$/)
  const code = hex ? parseInt(hex[1], 16) : dec ? parseInt(dec[1], 10) : NaN
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : entity
}

/* ---------- misc ---------- */

export const RATIOS = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '3:2': '3 / 2', '3:4': '3 / 4', '21:9': '21 / 9', auto: 'auto' } as const
export const RATIO_OPTIONS = Object.keys(RATIOS).map((k) => ({ label: k === 'auto' ? 'Original' : k, value: k }))
export const ratioCss = (v: unknown): string => RATIOS[pick(v, Object.keys(RATIOS) as Array<keyof typeof RATIOS>, 'auto')]
