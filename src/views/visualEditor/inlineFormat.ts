/**
 * Pure helpers for inline rich-text formatting on the canvas. Content is modelled as runs of characters with
 * marks (bold, italic, link) and serialised back to a strict HTML subset: strong, em, a[href], br.
 * Everything that goes through `sanitizeInlineHtml` comes out in that subset and nothing else.
 */

export type Run = { text: string; b: boolean; i: boolean; href: string | null }
export type Mark = 'bold' | 'italic' | 'link'

const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|\.{1,2}\/|\?)/i
const NO_SCHEME = /^[^:]*$/ // relative like "about" or "a/b"

/** The href when it is http(s), mailto, tel or relative; otherwise null. Control chars and whitespace tricks are rejected. */
export function safeHref(raw: string): string | null {
  const v = raw.replace(/&amp;/gi, '&').trim()
  if (!v || v.startsWith('//') || /[\x00-\x1f\x7f\s<>"'`]/.test(v)) return null
  return SAFE_HREF.test(v) || NO_SCHEME.test(v) ? v : null
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(160) }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 31 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'template', 'noscript'])

/** Parses (untrusted) HTML into runs. Unknown tags are dropped but their text kept; a newline run stands for <br>. */
export function parseInlineHtml(html: string): Run[] {
  const runs: Run[] = []
  let b = 0
  let i = 0
  const links: (string | null)[] = []
  let skip: string | null = null
  const push = (text: string) => {
    if (text) runs.push({ text, b: b > 0, i: i > 0, href: links.length ? (links[links.length - 1] ?? null) : null })
  }
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+|<)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      if (!skip) push(decode(m[4]))
      continue
    }
    if (!m[2]) continue
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()
    if (skip) {
      if (closing && name === skip) skip = null
      continue
    }
    if (!closing && DROP_CONTENT.has(name)) {
      skip = name
      continue
    }
    if (name === 'br') {
      if (!closing) push('\n')
    } else if (name === 'strong' || name === 'b') {
      if (!closing) b++
      else if (b > 0) b--
    } else if (name === 'em' || name === 'i') {
      if (!closing) i++
      else if (i > 0) i--
    } else if (name === 'a') {
      if (!closing) {
        const attr = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3] ?? '')
        const href = attr ? safeHref(decode(attr[1] ?? attr[2] ?? attr[3] ?? '')) : null
        links.push(href)
      } else if (links.length) links.pop()
    }
  }
  return runs
}

/** Serialises runs: <a><strong><em>text</em></strong></a>, adjacent runs with equal marks merged, newline as <br>. */
export function serializeRuns(runs: Run[]): string {
  const merged: Run[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = merged[merged.length - 1]
    if (last && last.b === r.b && last.i === r.i && last.href === r.href) last.text += r.text
    else merged.push({ text: r.text, b: r.b, i: r.i, href: r.href })
  }
  let out = ''
  let k = 0
  while (k < merged.length) {
    const href = merged[k].href
    let end = k
    while (end < merged.length && merged[end].href === href) end++
    let inner = ''
    for (const r of merged.slice(k, end)) {
      let seg = r.text.split('\n').map(escText).join('<br>')
      if (r.i) seg = `<em>${seg}</em>`
      if (r.b) seg = `<strong>${seg}</strong>`
      inner += seg
    }
    out += href ? `<a href="${escAttr(href)}" rel="noopener">${inner}</a>` : inner
    k = end
  }
  return out
}

/** Strict allowlist sanitiser: strong, em, a[href] (http/https/mailto/tel/relative, rel=noopener), br. Idempotent. */
export function sanitizeInlineHtml(html: string): string {
  return serializeRuns(parseInlineHtml(typeof html === 'string' ? html : ''))
}

/** Plain text of runs (newline for br). Offsets used by the helpers below index into this string. */
export const runsText = (runs: Run[]): string => runs.map((r) => r.text).join('')

const splitAt = (runs: Run[], pos: number): Run[] => {
  const out: Run[] = []
  let at = 0
  for (const r of runs) {
    const end = at + r.text.length
    if (pos > at && pos < end) {
      out.push({ ...r, text: r.text.slice(0, pos - at) }, { ...r, text: r.text.slice(pos - at) })
    } else out.push({ ...r })
    at = end
  }
  return out
}

const inRange = (runs: Run[], start: number, end: number, fn: (r: Run) => void, all?: (r: Run) => boolean): boolean => {
  let at = 0
  let every = true
  let any = false
  for (const r of runs) {
    const s = at
    at += r.text.length
    if (s >= start && at <= end && r.text !== '\n') {
      any = true
      if (all && !all(r)) every = false
      fn(r)
    }
  }
  return any && every
}

/**
 * Toggles bold/italic or sets/removes a link over the plain-text range [start, end). Bold/italic toggle off when
 * the whole range already has the mark. `link` with a safe href sets it; with null/unsafe href removes links.
 * Returns the sanitised HTML. An empty range changes nothing.
 */
export function applyFormat(html: string, start: number, end: number, mark: Mark, href?: string | null): string {
  let runs = parseInlineHtml(html)
  const total = runsText(runs).length
  const s = Math.max(0, Math.min(start, end))
  const e = Math.min(total, Math.max(start, end))
  if (e <= s) return serializeRuns(runs)
  runs = splitAt(splitAt(runs, s), e)
  if (mark === 'link') {
    const safe = href ? safeHref(href) : null
    inRange(runs, s, e, (r) => {
      r.href = safe
    })
  } else {
    const key = mark === 'bold' ? 'b' : 'i'
    const allOn = inRange(runs, s, e, () => undefined, (r) => r[key])
    inRange(runs, s, e, (r) => {
      r[key] = !allOn
    })
  }
  return serializeRuns(runs)
}

/** Removes bold, italic and links over the range (the whole text when the range is empty). */
export function clearFormat(html: string, start = 0, end = Number.MAX_SAFE_INTEGER): string {
  let runs = parseInlineHtml(html)
  const total = runsText(runs).length
  const s = Math.max(0, Math.min(start, end))
  const e = Math.min(total, Math.max(start, end))
  if (e <= s) return serializeRuns(runs.map((r): Run => ({ text: r.text, b: false, i: false, href: null })))
  runs = splitAt(splitAt(runs, s), e)
  inRange(runs, s, e, (r) => Object.assign(r, { b: false, i: false, href: null } satisfies Omit<Run, 'text'>))
  return serializeRuns(runs)
}

/** Plain text of an HTML fragment (what a rich value reads as without markup). */
export const htmlToText = (html: string): string => runsText(parseInlineHtml(html))

/** Escapes plain text into the rich subset (newlines become <br>). */
export const textToHtml = (text: string): string => serializeRuns([{ text, b: false, i: false, href: null }])

/** Key combo to mark: Ctrl/Cmd+B, I, K. */
export function shortcutMark(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): Mark | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  return k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'k' ? 'link' : null
}
