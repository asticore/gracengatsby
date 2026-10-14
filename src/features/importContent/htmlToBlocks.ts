/**
 * Converts imported HTML (a WordPress post body or a CSV cell) into the
 * Lexical nodes this app stores in rich text fields.
 *
 * Rules: script, style, iframe and other embeds are removed (embeds are
 * counted). WordPress block comments are removed with the rest of the
 * comments. Shortcodes such as [caption] or [gallery] are removed but their
 * text is kept. Images are not downloaded: the image address is kept as text
 * and counted. Links keep only safe addresses (http, https, mailto, tel and
 * relative paths).
 */

import {
  FORMAT,
  hasVisibleContent,
  heading,
  horizontalRule,
  lineBreak,
  link,
  listItem,
  listNode,
  paragraph,
  pushText,
  quote,
  textNode,
  trimInline,
  type LexicalNode,
} from './lexical'
import { parseMarkup, type MarkupNode } from './markup'
import { safeUrl, stripShortcodes } from './htmlSafety'

export { safeUrl, stripShortcodes }

export type HtmlConversion = {
  children: LexicalNode[]
  imagesNotCopied: number
  embedsRemoved: number
}

type Ctx = { images: number; embeds: number }

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const RAW_TAGS = new Set(['script', 'style'])
/** Removed with everything inside them. */
const DROP_TAGS = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'svg', 'form', 'input', 'button', 'select', 'textarea'])
/** Removed, and counted as an embed. */
const EMBED_TAGS = new Set(['iframe', 'object', 'embed', 'video', 'audio', 'canvas'])
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'center', 'address',
  'body', 'html', 'details', 'summary', 'dl', 'dd', 'dt', 'pre', 'caption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'li', 'ul', 'ol', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])
const FORMAT_TAGS: Record<string, number> = {
  strong: FORMAT.bold,
  b: FORMAT.bold,
  em: FORMAT.italic,
  i: FORMAT.italic,
  u: FORMAT.underline,
  ins: FORMAT.underline,
  s: FORMAT.strikethrough,
  strike: FORMAT.strikethrough,
  del: FORMAT.strikethrough,
  code: FORMAT.code,
  kbd: FORMAT.code,
  samp: FORMAT.code,
  sub: FORMAT.subscript,
  sup: FORMAT.superscript,
}
/** Inside running text these end the current line, so the words do not run together. */
const BREAK_TAGS = new Set([...BLOCK_TAGS].filter((name) => name !== 'td' && name !== 'th'))

function autoClose(open: string, incoming: string): boolean {
  if (open === 'p') return BLOCK_TAGS.has(incoming)
  if (open === 'li') return incoming === 'li'
  if (open === 'td' || open === 'th') return incoming === 'td' || incoming === 'th' || incoming === 'tr'
  if (open === 'tr') return incoming === 'tr'
  if (open === 'dt' || open === 'dd') return incoming === 'dt' || incoming === 'dd'
  return false
}

/** Headings 1 to 4 are kept; 5 and 6 become 4. */
function headingTag(name: string): 'h1' | 'h2' | 'h3' | 'h4' {
  const tags = ['h1', 'h2', 'h3', 'h4'] as const
  return tags[Math.min(Number(name.charAt(1)), 4) - 1]
}

function pushBreak(out: LexicalNode[]): void {
  const last = out[out.length - 1]
  if (last && last.type !== 'linebreak') out.push(lineBreak())
}

/** Inline content: text, formatting, links, line breaks. Block tags inside it are flattened. */
function collectInline(nodes: MarkupNode[], format: number, ctx: Ctx, out: LexicalNode[]): void {
  for (const el of nodes) {
    const name = el.name
    if (name === '#text') {
      pushText(out, stripShortcodes(el.text).replace(/\s+/g, ' '), format)
      continue
    }
    if (DROP_TAGS.has(name)) continue
    if (EMBED_TAGS.has(name)) {
      ctx.embeds++
      continue
    }
    if (name === 'br') {
      out.push(lineBreak())
      continue
    }
    if (name === 'img') {
      ctx.images++
      const src = (el.attrs.src ?? '').trim()
      if (src) {
        pushText(out, ' ', format)
        pushText(out, src, format)
        pushText(out, ' ', format)
      }
      continue
    }
    if (name === 'a') {
      const inner: LexicalNode[] = []
      collectInline(el.children, format, ctx, inner)
      const url = safeUrl(el.attrs.href)
      if (!url) out.push(...inner)
      else out.push(link(url, (el.attrs.target ?? '').toLowerCase() === '_blank', inner.length ? inner : [textNode(url)]))
      continue
    }
    if (FORMAT_TAGS[name] !== undefined) {
      collectInline(el.children, format | FORMAT_TAGS[name], ctx, out)
      continue
    }
    if (BREAK_TAGS.has(name)) {
      collectInline(el.children, format, ctx, out)
      pushBreak(out)
      continue
    }
    collectInline(el.children, format, ctx, out)
  }
}

function inlineOf(nodes: MarkupNode[], ctx: Ctx): LexicalNode[] {
  const out: LexicalNode[] = []
  collectInline(nodes, 0, ctx, out)
  return trimInline(out)
}

function listFrom(el: MarkupNode, ctx: Ctx): LexicalNode | null {
  const items: LexicalNode[] = []
  for (const child of el.children) {
    if (child.name === 'li') {
      const kids = itemChildren(child, ctx)
      if (hasVisibleContent(kids)) items.push(listItem(kids))
    } else if (child.name === 'ul' || child.name === 'ol') {
      const nested = listFrom(child, ctx)
      if (nested) items.push(listItem([nested]))
    }
  }
  return items.length ? listNode(el.name === 'ol', items) : null
}

/** Item content: inline runs, with any nested list kept as its own node. */
function itemChildren(li: MarkupNode, ctx: Ctx): LexicalNode[] {
  const out: LexicalNode[] = []
  let run: MarkupNode[] = []
  const flushRun = () => {
    out.push(...inlineOf(run, ctx))
    run = []
  }
  for (const child of li.children) {
    if (child.name === 'ul' || child.name === 'ol') {
      flushRun()
      const nested = listFrom(child, ctx)
      if (nested) out.push(nested)
    } else run.push(child)
  }
  flushRun()
  return out
}

/** Block level: paragraphs, headings, lists, quotes, rules, table rows as lines. */
function blocks(nodes: MarkupNode[], out: LexicalNode[], ctx: Ctx): void {
  let run: MarkupNode[] = []
  const flushRun = () => {
    const kept = inlineOf(run, ctx)
    run = []
    if (hasVisibleContent(kept)) out.push(paragraph(kept))
  }
  for (const el of nodes) {
    const name = el.name
    const isInline = name === '#text' || (!BLOCK_TAGS.has(name) && !DROP_TAGS.has(name) && !EMBED_TAGS.has(name))
    if (isInline) {
      run.push(el)
      continue
    }
    flushRun()
    if (DROP_TAGS.has(name)) continue
    if (EMBED_TAGS.has(name)) {
      ctx.embeds++
      continue
    }
    if (/^h[1-6]$/.test(name)) {
      const kept = inlineOf(el.children, ctx)
      if (hasVisibleContent(kept)) out.push(heading(headingTag(name), kept))
    } else if (name === 'p') {
      const kept = inlineOf(el.children, ctx)
      if (hasVisibleContent(kept)) out.push(paragraph(kept))
    } else if (name === 'ul' || name === 'ol') {
      const list = listFrom(el, ctx)
      if (list) out.push(list)
    } else if (name === 'blockquote') {
      const kept = inlineOf(el.children, ctx)
      if (hasVisibleContent(kept)) out.push(quote(kept))
    } else if (name === 'hr') {
      out.push(horizontalRule())
    } else if (name === 'tr') {
      rowLine(el, out, ctx)
    } else {
      blocks(el.children, out, ctx)
    }
  }
  flushRun()
}

/** One table row becomes one line, cells separated by " | ". */
function rowLine(row: MarkupNode, out: LexicalNode[], ctx: Ctx): void {
  const cells: LexicalNode[][] = []
  for (const cell of row.children) {
    if (cell.name !== 'td' && cell.name !== 'th') continue
    const kept = inlineOf(cell.children, ctx)
    if (hasVisibleContent(kept)) cells.push(kept)
  }
  if (!cells.length) return
  const joined: LexicalNode[] = []
  cells.forEach((cell, index) => {
    if (index) pushText(joined, ' | ', 0)
    joined.push(...cell)
  })
  out.push(paragraph(joined))
}

export function convertHtml(html: string): HtmlConversion {
  const ctx: Ctx = { images: 0, embeds: 0 }
  const root = parseMarkup(html, { voidTags: VOID_TAGS, rawText: RAW_TAGS, autoClose, lowerCase: true })
  const children: LexicalNode[] = []
  blocks(root.children, children, ctx)
  return { children, imagesNotCopied: ctx.images, embedsRemoved: ctx.embeds }
}

/** Plain text (no tags) split into one paragraph per non-empty line. The HTML reader decodes entities later. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${line}</p>`)
    .join('')
}
