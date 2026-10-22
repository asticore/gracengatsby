/**
 * Dynamic data tags: `{{post.title}}` style placeholders resolved against a plain context object.
 * Pure and total: never throws, no nesting, no eval. Every value is HTML-escaped.
 */

export const MAX_TAG_INPUT = 2000

export type DateFormat = 'short' | 'long'

export type TagContext = {
  post?: { title?: unknown; date?: unknown; excerpt?: unknown; author?: unknown }
  page?: { title?: unknown }
  site?: { name?: unknown; year?: unknown }
  product?: { title?: unknown; price?: unknown }
  event?: { title?: unknown; date?: unknown; location?: unknown; summary?: unknown }
  /** Locale for dates. Default en-AU. */
  locale?: string
  /** Currency code for numeric prices. Default AUD. */
  currency?: string
  dateFormat?: DateFormat
}

export const TAG_NAMES = [
  'post.title', 'post.date', 'post.excerpt', 'post.author', 'page.title', 'site.name', 'site.year', 'product.title', 'product.price',
  'event.title', 'event.date', 'event.location', 'event.summary',
] as const

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function formatTagDate(raw: unknown, format: DateFormat = 'short', locale = 'en-AU'): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const d = raw instanceof Date ? raw : new Date(typeof raw === 'string' || typeof raw === 'number' ? raw : NaN)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, format === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
  } catch {
    return ''
  }
}

export function formatTagPrice(raw: unknown, currency = 'AUD', locale = 'en-AU'): string {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return ''
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(raw)
    } catch {
      return raw.toFixed(2)
    }
  }
  return typeof raw === 'string' ? raw : ''
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}

function rawValue(name: string, ctx: TagContext): string {
  const locale = ctx.locale || 'en-AU'
  switch (name) {
    case 'post.title': return str(ctx.post?.title)
    case 'post.date': return formatTagDate(ctx.post?.date, ctx.dateFormat, locale)
    case 'post.excerpt': return str(ctx.post?.excerpt)
    case 'post.author': return str(ctx.post?.author)
    case 'page.title': return str(ctx.page?.title)
    case 'site.name': return str(ctx.site?.name)
    case 'site.year': return str(ctx.site?.year) || String(new Date().getUTCFullYear())
    case 'product.title': return str(ctx.product?.title)
    case 'product.price': return formatTagPrice(ctx.product?.price, ctx.currency, locale)
    case 'event.title': return str(ctx.event?.title)
    case 'event.date': return formatTagDate(ctx.event?.date, ctx.dateFormat, locale)
    case 'event.location': return str(ctx.event?.location)
    case 'event.summary': return str(ctx.event?.summary)
    default: return ''
  }
}

const TAG_RE = /\{\{\s*([a-z]+\.[a-z]+)\s*\}\}/gi

/**
 * Replaces known tags with escaped values. Unknown tags become ''. Input is cut at MAX_TAG_INPUT characters.
 * The literal text outside tags is escaped too, so the result is safe to inject as HTML.
 * Substituted values are never re-scanned, so tags cannot nest or expand each other.
 */
export function resolveTags(text: unknown, ctx: TagContext = {}): string {
  try {
    if (typeof text !== 'string' || !text) return ''
    const safeCtx = ctx && typeof ctx === 'object' ? ctx : {}
    const input = text.slice(0, MAX_TAG_INPUT)
    // Drop leftover {{...}} that are not valid tags (unknown names, extra dots) before the real pass.
    const cleaned = input.replace(/\{\{[^{}]*\}\}/g, (m) => (new RegExp(`^${TAG_RE.source}$`, 'i').test(m) ? m : ''))
    let out = ''
    let last = 0
    for (const m of cleaned.matchAll(TAG_RE)) {
      const at = m.index ?? 0
      out += escapeHtml(cleaned.slice(last, at))
      out += escapeHtml(rawValue(m[1].toLowerCase(), safeCtx))
      last = at + m[0].length
    }
    out += escapeHtml(cleaned.slice(last))
    return out
  } catch {
    return ''
  }
}