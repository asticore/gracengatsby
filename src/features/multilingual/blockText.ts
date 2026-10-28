/**
 * Block text addressing: which translatable strings a page's (or post's, or
 * product's) builder blocks hold, how each one is named, and how to read and
 * write it.
 *
 * A field path for block text is `<blocksField>.<blockKey>.<path>`, for
 * example `blocks.8f2c1d.heading` on a page, `layout.8f2c1d.props.text` for
 * an element block on a post. The block key is the block's stored `id` when it
 * has one, which survives reordering and editing. Blocks nested in a section's
 * columns are stored as JSON with no id, so they are keyed by their position,
 * `#<top index>-<column>-<index>`. A reorder then makes those rows stale (the
 * source text no longer matches what was approved), which hides them from the
 * public site until someone checks them again; it never shows the wrong text.
 *
 * Pure: no engine, no request, no node-only imports, so the overlay, the
 * overview, the machine drafts and the edge-safe paths all share it.
 */

import { BLOCK_TEXT, ELEMENT_BLOCK_TYPE, ELEMENT_TEXT, type BlockTextFieldSpec } from './blockTextRegistry'

/** Document fields that hold page-builder blocks: `blocks` on pages, `layout` on posts and products. */
export const BLOCK_FIELD_NAMES: readonly string[] = ['blocks', 'layout']

/** Keys are used inside dot paths, so they are restricted to characters that never clash with a separator. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const PREVIEW_LENGTH = 60

type Node = Record<string, unknown>

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The group a translatable field belongs to: one block on one document. */
export type BlockGroup = {
  key: string
  blockType: string
  /** Shown as the group heading, e.g. "Hero" or "Element · Heading". */
  blockLabel: string
  /** The first translatable text in the block, trimmed, for recognising it in the list. */
  preview: string
}

export type BlockTextAddress = {
  /** The stored field path, e.g. `blocks.8f2c1d.heading`. */
  fieldPath: string
  label: string
  size: 'text' | 'long'
  /** The source text as it reads now. Never empty: empty fields are not addressed. */
  sourceText: string
  group: BlockGroup
}

/** The block key for a node at `index` (top level first, then column and child positions). */
export function blockKeyFor(node: Node, index: readonly number[]): string {
  const id = node.id
  if ((typeof id === 'string' || typeof id === 'number') && KEY_PATTERN.test(String(id))) return String(id)
  return `#${index.join('-')}`
}

/** Calls `visit` for every block in the field, including blocks nested in section columns. */
function walkBlocks(list: unknown, prefix: readonly number[], visit: (node: Node, index: number[]) => void): void {
  if (!Array.isArray(list)) return
  list.forEach((node, position) => {
    if (!isNode(node)) return
    const index = [...prefix, position]
    visit(node, index)
    if (node.blockType === 'section' && Array.isArray(node.columns)) {
      node.columns.forEach((column, columnIndex) => {
        if (isNode(column)) walkBlocks(column.blocks, [...index, columnIndex], visit)
      })
    }
  })
}

/** The registry entry and the path prefix for a block, or null when the block holds no translatable text. */
function specFor(node: Node): { spec: { label: string; fields: BlockTextFieldSpec[] }; prefix: string; labelPrefix: string } | null {
  const blockType = typeof node.blockType === 'string' ? node.blockType : ''
  if (blockType === ELEMENT_BLOCK_TYPE) {
    const elementType = typeof node.elementType === 'string' ? node.elementType : ''
    const spec = Object.prototype.hasOwnProperty.call(ELEMENT_TEXT, elementType) ? ELEMENT_TEXT[elementType] : undefined
    return spec ? { spec, prefix: 'props.', labelPrefix: 'Element · ' } : null
  }
  const spec = Object.prototype.hasOwnProperty.call(BLOCK_TEXT, blockType) ? BLOCK_TEXT[blockType] : undefined
  return spec ? { spec, prefix: '', labelPrefix: '' } : null
}

/** Reads a dot path inside a node, undefined on any gap. */
function getIn(node: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, part) => {
    if (current === null || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[part]
  }, node)
}

/** Immutable deep set inside a node, creating missing objects along the way. */
function setIn(node: Node, path: readonly string[], value: unknown): Node {
  const [head, ...tail] = path
  if (head === undefined) return node
  if (tail.length === 0) return { ...node, [head]: value }
  const child = isNode(node[head]) ? (node[head] as Node) : {}
  return { ...node, [head]: setIn(child, tail, value) }
}

/** True for a field path that addresses a block: `<blocksField>.<key>.<path>`. */
export function isBlockFieldPath(path: string): boolean {
  const dot = path.indexOf('.')
  return dot > 0 && BLOCK_FIELD_NAMES.includes(path.slice(0, dot)) && path.indexOf('.', dot + 1) > dot
}

/** Every translatable block string in a document, in document order. Empty strings are left out. */
export function blockTextAddresses(doc: unknown, blocksField: string): BlockTextAddress[] {
  if (!isNode(doc) || !Array.isArray(doc[blocksField])) return []
  const out: BlockTextAddress[] = []

  walkBlocks(doc[blocksField], [], (node, index) => {
    const resolved = specFor(node)
    if (!resolved) return
    const key = blockKeyFor(node, index)
    const found: Array<Omit<BlockTextAddress, 'group'>> = []
    for (const field of resolved.spec.fields) {
      const full = `${resolved.prefix}${field.path}`
      const value = getIn(node, full.split('.'))
      if (typeof value !== 'string' || value.trim().length === 0) continue
      found.push({
        fieldPath: `${blocksField}.${key}.${full}`,
        label: `${resolved.labelPrefix}${resolved.spec.label} · ${field.label}`,
        size: field.size,
        sourceText: value,
      })
    }
    if (found.length === 0) return
    const preview = found[0].sourceText.trim().replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH)
    const group: BlockGroup = {
      key,
      blockType: typeof node.blockType === 'string' ? node.blockType : '',
      blockLabel: `${resolved.labelPrefix}${resolved.spec.label}`,
      preview,
    }
    for (const address of found) out.push({ ...address, group })
  })

  return out
}

/** The value at a block field path, or undefined when the block or field is not there. */
export function readBlockField(doc: unknown, path: string): unknown {
  const [head, key, ...rest] = path.split('.')
  if (!head || !key || rest.length === 0 || !isNode(doc) || !Array.isArray(doc[head])) return undefined
  const matches: Node[] = []
  walkBlocks(doc[head], [], (node, index) => {
    if (matches.length === 0 && blockKeyFor(node, index) === key) matches.push(node)
  })
  return matches.length === 0 ? undefined : getIn(matches[0], rest)
}

/** Writes a value at a block field path, returning a new document. Other blocks are untouched. */
export function writeBlockField(doc: unknown, path: string, value: unknown): unknown {
  const [head, key, ...rest] = path.split('.')
  if (!head || !key || rest.length === 0 || !isNode(doc) || !Array.isArray(doc[head])) return doc

  let present = false
  walkBlocks(doc[head], [], (node, index) => {
    if (blockKeyFor(node, index) === key) present = true
  })
  if (!present) return doc

  const mapBlocks = (list: unknown[], prefix: readonly number[]): unknown[] =>
    list.map((node, position) => {
      if (!isNode(node)) return node
      const index = [...prefix, position]
      if (blockKeyFor(node, index) === key) return setIn(node, rest, value)
      if (node.blockType === 'section' && Array.isArray(node.columns)) {
        return {
          ...node,
          columns: node.columns.map((column, columnIndex) =>
            isNode(column) && Array.isArray(column.blocks) ? { ...column, blocks: mapBlocks(column.blocks, [...index, columnIndex]) } : column,
          ),
        }
      }
      return node
    })

  return { ...doc, [head]: mapBlocks(doc[head] as unknown[], []) }
}
