/**
 * Text helpers shared by the HTML and plain-text renderers: escaping, safe links,
 * {{tag}} filling, and the small **bold** / [link](url) syntax.
 *
 * Order matters for safety: the template is split into pieces first, then each
 * piece is escaped, then tags are filled with escaped values. A value can never
 * add bold or a link, and a link can only be http, https or mailto.
 */

import type { TemplateValues } from '../renderTemplate'

const TAG = /\{\{\s*(\w+)\s*\}\}/g

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** Only web and mail links are allowed in an email. */
export const isSafeUrl = (value: string): boolean => /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(value.trim())

export const tagValue = (values: TemplateValues, key: string): string => {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return ''
  const value = values[key]
  return value === undefined || value === null ? '' : String(value)
}

/** Fills tags with plain values, leaving the result unescaped. Used for URLs and plain text. */
export const fillPlain = (text: string, values: TemplateValues): string => text.replace(TAG, (_whole, key: string) => tagValue(values, key))

/** Escapes a template piece, then fills its tags with escaped values. */
export const fillHtml = (text: string, values: TemplateValues): string =>
  escapeHtml(text).replace(TAG, (_whole, key: string) => escapeHtml(tagValue(values, key)))

export type InlinePart = { kind: 'text'; value: string } | { kind: 'bold'; value: string } | { kind: 'link'; label: string; url: string }

const INLINE = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** Splits a template paragraph into plain text, bold and link pieces. Works on the raw template, before any values are filled. */
export const splitInline = (text: string): InlinePart[] => {
  const parts: InlinePart[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', value: text.slice(last, index) })
    if (match[1] !== undefined) parts.push({ kind: 'bold', value: match[1] })
    else parts.push({ kind: 'link', label: match[2] ?? '', url: match[3] ?? '' })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}

/** One paragraph to HTML: bold, safe links, tags filled and escaped. */
export const inlineToHtml = (text: string, values: TemplateValues, linkStyle: string, boldStyle: string): string =>
  splitInline(text)
    .map((part) => {
      if (part.kind === 'text') return fillHtml(part.value, values)
      if (part.kind === 'bold') return `<strong style="${boldStyle}">${fillHtml(part.value, values)}</strong>`
      const url = fillPlain(part.url, values).trim()
      const label = fillHtml(part.label, values)
      if (!isSafeUrl(url)) return label
      return `<a href="${escapeHtml(url)}" target="_blank" style="${linkStyle}">${label}</a>`
    })
    .join('')

/** One piece of text to plain text: bold markers removed, links shown as "label (url)". */
export const inlineToPlain = (text: string, values: TemplateValues): string =>
  splitInline(text)
    .map((part) => {
      if (part.kind === 'text' || part.kind === 'bold') return fillPlain(part.value, values)
      const url = fillPlain(part.url, values).trim()
      const label = fillPlain(part.label, values)
      if (!isSafeUrl(url) || url === label) return label
      return `${label} (${url})`
    })
    .join('')

/** Plain fill of a field that is not formatted, such as a heading or button label. */
export const plainField = (text: string, values: TemplateValues): string => fillPlain(text, values)
