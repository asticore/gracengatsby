/**
 * Pulls the readable parts of a document for the analysis: paragraphs of text,
 * headings, links and images. Walks the nested JSON the same way the text
 * helpers do (rich text trees, blocks, columns). Pure, no I/O.
 *
 * Rich text is Lexical JSON: block nodes (paragraph, heading, quote, list item)
 * give one paragraph or heading each; inline nodes (text, links) are joined
 * into their block. Block fields keep their text under the keys in TEXT_KEYS.
 */

import { TEXT_KEYS } from '@/features/editScreens/textFields'
import type { AnalysisInput } from './types'

type Heading = AnalysisInput['headings'][number]
type Link = AnalysisInput['links'][number]
type Image = AnalysisInput['images'][number]
type Collected = { paragraphs: string[]; headings: Heading[]; links: Link[]; images: Image[] }

const BLOCK_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'quote', 'listitem'])
const SKIP_KEYS: ReadonlySet<string> = new Set(['id', 'blockType', 'blockName', 'design', 'style', 'direction', 'format', 'type', 'version', 'indent', 'mode', 'detail', 'htmlId'])
/** Top-level fields that are not page body: the title, SEO settings and the excerpt. */
const TOP_EXCLUDED: ReadonlySet<string> = new Set(['title', 'seo', 'excerpt', 'slug'])
const URL_KEY = /^(url|href)$|Url$|Href$/
const MAX_DEPTH = 40

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const childrenOf = (node: Record<string, unknown>): unknown[] => (Array.isArray(node.children) ? node.children : [])
const isBlock = (node: Record<string, unknown>): boolean => typeof node.type === 'string' && BLOCK_TYPES.has(node.type)

function addLink(out: Collected, raw: string): void {
  const href = raw.trim()
  if (!href || /^(mailto|tel):/i.test(href)) return
  const external = /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith('//')
  out.links.push({ href, internal: !external })
}

function addImage(out: Collected, alt: unknown): void {
  out.images.push({ alt: typeof alt === 'string' ? alt : '' })
}

/** The text inside a block, with links and images noted on the way. Nested blocks are skipped. */
function inlineText(node: Record<string, unknown>, out: Collected, depth: number): string {
  if (depth > MAX_DEPTH) return ''
  if (node.type === 'linebreak' || node.type === 'tab') return ' '
  if (typeof node.text === 'string') return node.text
  if (node.type === 'upload') {
    const value = isRecord(node.value) ? node.value : node
    addImage(out, value.alt)
    return ''
  }
  if (node.type === 'link') {
    const fields = isRecord(node.fields) ? node.fields : node
    if (typeof fields.url === 'string') addLink(out, fields.url)
  }
  let text = ''
  for (const child of childrenOf(node)) {
    if (isRecord(child) && !isBlock(child)) text += inlineText(child, out, depth + 1)
  }
  return text
}

function collectBlock(node: Record<string, unknown>, out: Collected, depth: number): void {
  if (depth > MAX_DEPTH) return
  const text = inlineText(node, out, 0).replace(/\s+/g, ' ').trim()
  if (node.type === 'heading') {
    const level = Number(String(node.tag ?? '').replace(/^h/, ''))
    if (text) out.headings.push({ level, text })
  } else if (text) {
    out.paragraphs.push(text)
  }
  for (const child of childrenOf(node)) if (isRecord(child)) findBlocks(child, out, depth + 1)
}

/** Finds block nodes nested inside containers such as lists. */
function findBlocks(node: Record<string, unknown>, out: Collected, depth: number): void {
  if (depth > MAX_DEPTH) return
  if (isBlock(node)) {
    collectBlock(node, out, depth)
    return
  }
  for (const child of childrenOf(node)) if (isRecord(child)) findBlocks(child, out, depth + 1)
}

function walk(node: unknown, key: string, out: Collected, depth: number): void {
  if (depth > MAX_DEPTH) return
  if (typeof node === 'string') {
    if (TEXT_KEYS.has(key) && node.trim()) out.paragraphs.push(node.trim())
    else if (URL_KEY.test(key)) addLink(out, node)
    return
  }
  if (Array.isArray(node)) {
    for (const entry of node) walk(entry, key, out, depth + 1)
    return
  }
  if (!isRecord(node)) return

  if (node.type === 'upload') {
    addImage(out, isRecord(node.value) ? node.value.alt : node.alt)
    return
  }
  if (isBlock(node)) {
    collectBlock(node, out, depth)
    return
  }
  if (typeof node.mimeType === 'string' && node.mimeType.startsWith('image/')) {
    addImage(out, node.alt)
    return
  }
  if (node.blockType === 'heading') {
    const text = typeof node.text === 'string' ? node.text : typeof node.heading === 'string' ? node.heading : ''
    const level = typeof node.level === 'number' ? node.level : 2
    if (text.trim()) out.headings.push({ level, text: text.trim() })
    return
  }
  for (const [childKey, child] of Object.entries(node)) {
    if (SKIP_KEYS.has(childKey)) continue
    walk(child, childKey, out, depth + 1)
  }
}

/**
 * Reads a document (a page, post, product or event, as loaded from the
 * database) and returns the text, headings, links and images for the analysis.
 * Paragraphs in `text` are separated by a blank line.
 */
export function extractForAnalysis(doc: Record<string, unknown>): Pick<AnalysisInput, 'text' | 'headings' | 'links' | 'images'> {
  const out: Collected = { paragraphs: [], headings: [], links: [], images: [] }
  for (const [key, value] of Object.entries(doc)) {
    if (TOP_EXCLUDED.has(key) || SKIP_KEYS.has(key)) continue
    walk(value, key, out, 1)
  }
  const text = out.paragraphs.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n')
  return { text, headings: out.headings, links: out.links, images: out.images }
}
