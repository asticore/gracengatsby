/**
 * A small strict allow-list sanitiser for the free HTML an editor can put in a
 * form (the "html" element and a section body). It runs when a layout is saved
 * and again when the public config is built, so stored markup from before the
 * filter existed is still cleaned on the way out.
 *
 * Only listed tags and attributes survive. Anything else is dropped, with its
 * content kept - except script, style, iframe, object and friends, whose
 * content goes too. No on* handlers, and URLs must be http(s), mailto, tel,
 * a same-site path or a fragment (a data: URL is only allowed for images).
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'title', 'head'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  '*': new Set(['class', 'title']),
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
}

const CONTROL_OR_SPACE = new RegExp('[\\u0000-\\u0020\\u007f-\\u009f\\u2028\\u2029]', 'g')

function safeUrl(value: string, tag: string): boolean {
  const compact = decodeEntities(value).replace(CONTROL_OR_SPACE, '').toLowerCase()
  if (!compact) return false
  if (compact.startsWith('#')) return true
  if (compact.startsWith('//')) return false
  if (compact.startsWith('/')) return true
  if (/^https?:/.test(compact) || (tag === 'a' && /^(mailto|tel):/.test(compact))) return true
  if (tag === 'img' && /^data:image\/(png|jpe?g|gif|webp|avif);/.test(compact)) return true
  // A relative URL has no scheme at all.
  return !/^[a-z][a-z0-9+.-]*:/.test(compact)
}

function cleanAttrs(tag: string, raw: string): string {
  let out = ''
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase()
    if (name.startsWith('on')) continue
    if (!(ALLOWED_ATTRS[tag]?.has(name) || ALLOWED_ATTRS['*'].has(name))) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if ((name === 'href' || name === 'src') && !safeUrl(value, tag)) continue
    if (name === 'target' && value !== '_blank' && value !== '_self') continue
    out += ` ${name}="${escapeAttr(value)}"`
  }
  if (tag === 'a' && /target="_blank"/.test(out)) out += ' rel="noopener noreferrer"'
  return out
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|</g

export function sanitiseHtml(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  const html = input.slice(0, 100_000)
  let out = ''
  let last = 0
  let skipUntil: string | null = null
  const open: string[] = []
  let match: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((match = TOKEN.exec(html))) {
    const text = html.slice(last, match.index)
    last = match.index + match[0].length
    if (!skipUntil) out += text.replace(/>/g, '&gt;')
    if (match[0].startsWith('<!--')) continue
    if (!match[2]) {
      if (!skipUntil) out += '&lt;'
      continue
    }
    const closing = match[1] === '/'
    const tag = match[2].toLowerCase()
    if (skipUntil) {
      if (closing && tag === skipUntil) skipUntil = null
      continue
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !/\/\s*$/.test(match[3])) skipUntil = tag
      continue
    }
    if (!ALLOWED_TAGS.has(tag)) continue
    if (closing) {
      const index = open.lastIndexOf(tag)
      if (index === -1) continue
      out += open.splice(index).reverse().map((name) => `</${name}>`).join('')
      continue
    }
    out += `<${tag}${cleanAttrs(tag, match[3])}>`
    if (!VOID_TAGS.has(tag)) open.push(tag)
  }
  if (!skipUntil) out += html.slice(last).replace(/>/g, '&gt;')
  out += open.reverse().map((name) => `</${name}>`).join('')
  return out
}

/** Sanitises every `props.html` in a layout tree (including nested columns), without mutating the input. */
export function sanitiseLayoutHtml<T>(nodes: T): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    const record = { ...(value as Record<string, unknown>) }
    const props = record.props
    if (props && typeof props === 'object' && !Array.isArray(props) && typeof (props as Record<string, unknown>).html === 'string') {
      record.props = { ...(props as Record<string, unknown>), html: sanitiseHtml((props as Record<string, unknown>).html) }
    }
    if (Array.isArray(record.columns)) {
      record.columns = record.columns.map((column) =>
        column && typeof column === 'object'
          ? { ...(column as Record<string, unknown>), blocks: visit((column as { blocks?: unknown }).blocks) }
          : column,
      )
    }
    return record
  }
  return visit(nodes) as T
}
