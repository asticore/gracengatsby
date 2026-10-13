/**
 * Table of contents support, pure (no React, no engine).
 *
 * annotatePage() walks a page's content once, in reading order. It gives every
 * h2-h4 heading in the rich text a unique id, stored on the heading node as
 * `htmlId` (the rich text renderer writes it out as the element id), and it
 * collects the headings so each Table of contents block on the page can list
 * them. Running it once on the whole page is what keeps the ids unique across
 * several rich text blocks.
 *
 * Headings are read from the page body (posts) and from the rich text inside
 * blocks, including blocks nested in section columns. Only the text of a
 * heading is read; nothing else in the document changes.
 */

import { forEachText } from './textFields'

export type TocLevel = 2 | 3 | 4

export type TocHeading = { id: string; level: TocLevel; text: string }

const HEADING_LEVELS = new Map<string, TocLevel>([
  ['h2', 2],
  ['h3', 3],
  ['h4', 4],
])

const MAX_DEPTH = 40
const MAX_HEADINGS = 200
const MAX_SLUG_LENGTH = 80

/**
 * A URL-safe id from heading text. Accents are folded away, letters from any
 * script are kept, and runs of anything else become one hyphen. Empty results
 * fall back to "section".
 */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  return slug || 'section'
}

/** Returns `base`, or `base-2`, `base-3`... if it is already taken. Adds the result to `used`. */
export function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`
  used.add(candidate)
  return candidate
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

type Context = { used: Set<string>; headings: TocHeading[] }

/** The plain text of a heading node, from its text children. */
function headingText(node: Record<string, unknown>): string {
  const parts: string[] = []
  forEachText(node.children, (text) => parts.push(text))
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * Copies a value, giving each h2-h4 heading node an `htmlId` and recording it in
 * reading order. Other nodes are copied unchanged. Table of contents blocks are
 * left for attachHeadings to fill in.
 */
function annotate(node: unknown, context: Context, depth: number): unknown {
  if (depth > MAX_DEPTH) return node
  if (Array.isArray(node)) return node.map((entry) => annotate(entry, context, depth + 1))
  if (!isRecord(node)) return node

  const level = typeof node.tag === 'string' ? HEADING_LEVELS.get(node.tag) : undefined
  if (node.type === 'heading' && level) {
    const text = headingText(node)
    const id = uniqueId(slugify(text), context.used)
    if (context.headings.length < MAX_HEADINGS) context.headings.push({ id, level, text: text || 'Section' })
    return { ...node, htmlId: id }
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) out[key] = annotate(child, context, depth + 1)
  return out
}

/** Copies the tree, setting `headings` on every table of contents block. */
function attachHeadings(node: unknown, headings: TocHeading[], depth: number): unknown {
  if (depth > MAX_DEPTH) return node
  if (Array.isArray(node)) return node.map((entry) => attachHeadings(entry, headings, depth + 1))
  if (!isRecord(node)) return node

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) out[key] = attachHeadings(child, headings, depth + 1)
  if (node.blockType === 'toc') out.headings = headings
  return out
}

/**
 * Annotates a whole page. `body` is an optional rich text body that sits
 * outside the blocks (a post's main content); it is read before the blocks.
 * The blocks keep their type, so callers do not need a cast.
 */
export function annotatePage<B>(input: { body?: unknown; blocks?: B }): { body: unknown; blocks: B; headings: TocHeading[] } {
  const context: Context = { used: new Set<string>(), headings: [] }
  const body = annotate(input.body, context, 0)
  const blocks = annotate(input.blocks, context, 0)
  const headings = context.headings
  return { body, blocks: attachHeadings(blocks, headings, 0) as B, headings }
}

/** The heading levels a Table of contents block can show. */
export type TocLevelChoice = 'h2' | 'h2-h3' | 'h2-h4'

export function levelsFor(choice: unknown): TocLevel[] {
  if (choice === 'h2') return [2]
  if (choice === 'h2-h3') return [2, 3]
  return [2, 3, 4]
}

export type TocNode = { heading: TocHeading; children: TocNode[] }

/**
 * Nests the headings by level: an h3 belongs under the nearest h2 before it,
 * an h4 under the nearest h3. A heading with no parent of a lower level (the
 * first h3 when h2 is hidden, say) sits at the top.
 */
export function buildTocTree(headings: TocHeading[], levels: TocLevel[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []
  for (const heading of headings) {
    if (!levels.includes(heading.level)) continue
    const node: TocNode = { heading, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].heading.level >= heading.level) stack.pop()
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return roots
}
