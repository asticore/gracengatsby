/**
 * Embed code (third-party script) - the pure core shared by the element, the frame route and the tests.
 *
 * DESIGN (why it looks like this):
 *  - A pasted snippet is arbitrary third-party code. It must run (widgets are useless otherwise) but must not be
 *    able to read the site's cookies, storage or DOM. So it never runs in the page: it runs in an iframe whose
 *    document is served by /embed-frame/<hash>?path=<page path> with a response-level CSP `sandbox` (no
 *    allow-same-origin), which gives the frame an OPAQUE origin even when opened directly. The iframe also
 *    carries the same sandbox attribute list.
 *  - srcdoc was rejected: srcdoc inherits the parent CSP, whose script-src only allows a handful of analytics
 *    hosts (and a custom admin CSP could be anything), so third-party scripts would be blocked. The route has
 *    its own relaxed CSP (EMBED_CODE_CSP) that is applied by the security headers builder for this path only;
 *    the main site CSP is not loosened and an admin custom CSP still applies everywhere else.
 *  - The snippet never travels in a URL and never appears in the parent page HTML. The parent only carries a
 *    content hash and the page path. The route re-reads the PUBLISHED document server-side, finds the element
 *    whose snippet hashes to that value and serves it. Drafts, trashed docs and password-locked docs 404.
 *  - Height: an injected script posts the document height to the parent; the parent listener only accepts a
 *    message whose event.source is its own iframe window and whose shape and hash match (parseResizeMessage).
 */

export const EMBED_CODE_ELEMENT = 'embed-code'
export const EMBED_FRAME_PREFIX = '/embed-frame/'
export const EMBED_CODE_MAX_SNIPPET = 20000
export const EMBED_CODE_MIN_HEIGHT = 40
export const EMBED_CODE_MAX_HEIGHT = 5000
export const EMBED_CODE_RESIZE_TYPE = 'eg-embed-code-resize'

/** Allowed consent categories for the gate (never 'necessary': a third party always needs a choice). */
export const EMBED_CODE_CATEGORIES = ['marketing', 'analytics', 'preferences'] as const
export type EmbedCodeCategory = (typeof EMBED_CODE_CATEGORIES)[number]

export const embedCodeCategory = (value: unknown): EmbedCodeCategory =>
  (EMBED_CODE_CATEGORIES as readonly string[]).includes(String(value)) ? (value as EmbedCodeCategory) : 'marketing'

/** No allow-same-origin: the frame origin is opaque, so it cannot read cookies or storage of the site. */
export const EMBED_CODE_SANDBOX = 'allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox'

/**
 * Response CSP of the frame document. Relaxed for third-party widgets (scripts, images, XHR, frames from https:)
 * but `sandbox` keeps the origin opaque and `frame-ancestors 'self'` stops other sites framing it.
 */
export const EMBED_CODE_CSP = [
  "default-src 'none'",
  "script-src https: 'unsafe-inline' 'unsafe-eval'",
  "style-src https: 'unsafe-inline'",
  'img-src https: data: blob:',
  'font-src https: data:',
  'connect-src https:',
  'media-src https: data: blob:',
  'frame-src https:',
  "object-src 'none'",
  "base-uri 'self'",
  'form-action https:',
  `sandbox ${EMBED_CODE_SANDBOX}`,
  "frame-ancestors 'self'",
].join('; ')

export const isEmbedFramePath = (pathname: string): boolean => /^\/embed-frame\/[0-9a-f]{32}\/?$/.test(pathname)

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** A page path is always a plain local path: leading slash, no scheme, no backslash, bounded length. */
export const safePagePath = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.length > 300) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || Array.from(raw).some((c) => c.charCodeAt(0) < 32)) return null
  return raw.split('?')[0].split('#')[0]
}

/** First 128 bits of SHA-256 of the snippet, hex. An identifier, not a secret. */
export async function snippetHash(snippet: string): Promise<string> {
  const bytes = new TextEncoder().encode(snippet)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const cleanSnippet = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, EMBED_CODE_MAX_SNIPPET) : '')

/** Fixed height in px, or null for auto-resize. */
export const embedHeight = (value: unknown): number | null => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(EMBED_CODE_MAX_HEIGHT, Math.max(EMBED_CODE_MIN_HEIGHT, Math.round(n)))
}

/** Finds the props of the embed-code element whose snippet hashes to `hash` anywhere in a document tree. */
export async function findEmbedSnippet(doc: unknown, hash: string): Promise<{ snippet: string; title: string } | null> {
  const stack: { node: unknown; depth: number }[] = [{ node: doc, depth: 0 }]
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (depth > 60) continue
    if (Array.isArray(node)) {
      for (const child of node) stack.push({ node: child, depth: depth + 1 })
      continue
    }
    if (!isRecord(node)) continue
    if (node.elementType === EMBED_CODE_ELEMENT && isRecord(node.props)) {
      const snippet = cleanSnippet(node.props.snippet)
      if (snippet && (await snippetHash(snippet)) === hash) {
        return { snippet, title: typeof node.props.title === 'string' ? node.props.title.slice(0, 200) : '' }
      }
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push({ node: value, depth: depth + 1 })
  }
  return null
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Tiny script appended after the snippet: reports the document height to the parent. */
const resizeScript = (hash: string): string =>
  `<script>(function(){var h=${JSON.stringify(hash)},last=0;function s(){var d=document.documentElement,n=Math.ceil(Math.max(d.scrollHeight,document.body?document.body.scrollHeight:0));if(n!==last){last=n;parent.postMessage({type:${JSON.stringify(EMBED_CODE_RESIZE_TYPE)},hash:h,height:n},"*")}}` +
  `addEventListener("load",s);if(window.ResizeObserver){new ResizeObserver(s).observe(document.documentElement)}else{setInterval(s,500)}s()})()</script>`

/** The full HTML document served by the frame route. The snippet is intentionally raw: it is the point of the element. */
export function buildFrameDocument(snippet: string, hash: string, title: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow">' +
    `<title>${escapeHtml(title || 'Embedded content')}</title><base target="_blank">` +
    '<style>html,body{margin:0;padding:0;background:transparent}body{font-family:system-ui,-apple-system,sans-serif}</style></head><body>' +
    snippet +
    resizeScript(hash) +
    '</body></html>'
  )
}

/** Response headers of the frame route (the middleware applies EMBED_CODE_CSP on top of the same value). */
export const embedFrameHeaders = (): Record<string, string> => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': EMBED_CODE_CSP,
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
})

/** Validates a resize message. Returns the clamped height, or null for anything that is not ours. */
export function parseResizeMessage(
  event: { source: unknown; data: unknown },
  frameWindow: unknown,
  hash: string,
): number | null {
  if (!frameWindow || event.source !== frameWindow) return null
  const data = event.data
  if (!isRecord(data) || data.type !== EMBED_CODE_RESIZE_TYPE || data.hash !== hash) return null
  const h = Number(data.height)
  if (typeof data.height !== 'number' || !Number.isFinite(h) || h <= 0) return null
  return Math.min(EMBED_CODE_MAX_HEIGHT, Math.max(EMBED_CODE_MIN_HEIGHT, Math.ceil(h)))
}
