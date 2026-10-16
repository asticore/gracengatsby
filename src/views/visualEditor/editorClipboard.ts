import type { SectionNode } from '@/lib/sectionTree'
import { getElementDef } from '@/lib/elements/registry'
import { isDeniedNodeType } from '@/features/templateRepos/manifest'

import { getBlockDef } from './blockSchemas'
import { getList, getNode, stripEditorIds, type NodePath } from './treeOps'

/**
 * Copy/paste for the visual editor. The clipboard payload is plain JSON text so it travels
 * between pages, tabs and browser windows. Everything here except the two system-clipboard
 * helpers at the bottom is pure.
 */
export const CLIPBOARD_FORMAT = 'engage-template'
export const CLIPBOARD_SCHEMA_VERSION = 1

export type ClipboardKind = 'section' | 'block'

export const CLIPBOARD_LIMITS = { maxChars: 1_000_000, maxDepth: 8, maxNodes: 300, maxRootNodes: 50, maxStringLength: 200_000 }

export type ClipboardPayload = { format: typeof CLIPBOARD_FORMAT; schemaVersion: 1; kind: ClipboardKind; tree: SectionNode[] }

export type Serialized = { kind: ClipboardKind; text: string; count: number }

/** What a path points at: a block (odd length) or a column (even length). */
export function serializeSelection(blocks: SectionNode[], path: NodePath | null): Serialized | null {
  if (!path || path.length === 0) return null
  let nodes: SectionNode[]
  let kind: ClipboardKind
  if (path.length % 2 === 1) {
    const node = getNode(blocks, path)
    if (!node) return null
    nodes = [node]
    kind = node.blockType === 'section' ? 'section' : 'block'
  } else {
    const list = getList(blocks, path)
    if (!list || list.length === 0) return null
    nodes = list
    kind = 'block'
  }
  const payload: ClipboardPayload = {
    format: CLIPBOARD_FORMAT,
    schemaVersion: CLIPBOARD_SCHEMA_VERSION,
    kind,
    tree: stripEditorIds(nodes),
  }
  return { kind, text: JSON.stringify(payload), count: nodes.length }
}

const DANGEROUS_TEXT = /<\s*(script|iframe|object|embed)\b|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'dangerouslySetInnerHTML'])
const TYPE_KEYS = ['type', 'blockType', 'elementType']

const isPlain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

function checkValue(value: unknown, depth: number): string | null {
  if (depth > 40) return 'The copied content is nested too deeply.'
  if (typeof value === 'string') {
    if (value.length > CLIPBOARD_LIMITS.maxStringLength) return 'The copied content has a text value that is too long.'
    return DANGEROUS_TEXT.test(value) ? 'The copied content contains script or frame code, which is not allowed.' : null
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = checkValue(item, depth + 1)
      if (problem) return problem
    }
    return null
  }
  if (isPlain(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `The copied content uses a field called "${key}", which is not allowed.`
      if (TYPE_KEYS.includes(key) && typeof item === 'string' && isDeniedNodeType(item)) return `"${item}" content cannot be pasted.`
      const problem = checkValue(item, depth + 1)
      if (problem) return problem
    }
    return null
  }
  return 'The copied content is not plain data.'
}

function checkNodes(nodes: unknown, depth: number, counter: { n: number }): string | null {
  if (!Array.isArray(nodes)) return 'The copied content is not a list of blocks.'
  if (depth > CLIPBOARD_LIMITS.maxDepth) return 'The copied content is nested too deeply.'
  for (const node of nodes) {
    if (!isPlain(node)) return 'The copied content has an item that is not a block.'
    counter.n += 1
    if (counter.n > CLIPBOARD_LIMITS.maxNodes) return 'The copied content has too many blocks.'
    const blockType = node.blockType
    if (typeof blockType !== 'string' || !blockType) return 'The copied content has a block without a type.'
    if (isDeniedNodeType(blockType)) return `"${blockType}" content cannot be pasted.`
    if (!getBlockDef(blockType)) return `This editor does not know the block type "${blockType}".`
    if (blockType === 'element') {
      const elementType = node.elementType
      if (typeof elementType !== 'string' || !getElementDef(elementType)) return 'The copied content has an unknown element.'
    }
    const valueProblem = checkValue(node, 0)
    if (valueProblem) return valueProblem
    if (node.columns !== undefined) {
      if (!Array.isArray(node.columns)) return 'The copied content has invalid columns.'
      for (const column of node.columns) {
        if (!isPlain(column)) return 'The copied content has an invalid column.'
        if (column.blocks === undefined) continue
        const problem = checkNodes(column.blocks, depth + 1, counter)
        if (problem) return problem
      }
    }
  }
  return null
}

export type ParseResult = { ok: true; kind: ClipboardKind; nodes: SectionNode[] } | { ok: false; error: string }

/** Strict parse of clipboard text. Never throws. */
export function parseClipboardText(text: unknown): ParseResult {
  const notOurs: ParseResult = { ok: false, error: 'The clipboard does not hold anything copied from this editor.' }
  if (typeof text !== 'string' || !text.trim()) return notOurs
  if (text.length > CLIPBOARD_LIMITS.maxChars) return { ok: false, error: 'The copied content is too large to paste.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return notOurs
  }
  if (!isPlain(data) || data.format !== CLIPBOARD_FORMAT) return notOurs
  if (data.schemaVersion !== CLIPBOARD_SCHEMA_VERSION) return { ok: false, error: 'The copied content comes from a different editor version.' }
  if (data.kind !== 'section' && data.kind !== 'block') return { ok: false, error: 'The copied content has an unknown kind.' }
  const tree = data.tree
  if (!Array.isArray(tree) || tree.length === 0 || tree.length > CLIPBOARD_LIMITS.maxRootNodes) {
    return { ok: false, error: 'The copied content is empty or has too many items.' }
  }
  const problem = checkNodes(tree, 0, { n: 0 })
  if (problem) return { ok: false, error: problem }
  return { ok: true, kind: data.kind, nodes: tree as SectionNode[] }
}

/**
 * Where a paste lands. A selected column receives it at the end; a selected block gets it
 * right after it (same list); with nothing selected (or a stale path) it goes at the page end.
 */
export function planPaste(blocks: SectionNode[], selectedPath: NodePath | null): { containerPath: NodePath; at: number } {
  const end = { containerPath: [] as NodePath, at: blocks.length }
  if (!selectedPath || selectedPath.length === 0) return end
  if (selectedPath.length % 2 === 0) {
    const list = getList(blocks, selectedPath)
    return list ? { containerPath: selectedPath, at: list.length } : end
  }
  if (!getNode(blocks, selectedPath)) return end
  return { containerPath: selectedPath.slice(0, -1), at: selectedPath[selectedPath.length - 1] + 1 }
}

/* ---------------------------------------------------------------------- */
/* System clipboard with an in-memory fallback                              */
/* ---------------------------------------------------------------------- */

let memoryCopy: string | null = null
/** True when the last write to the system clipboard failed, so memory is the only reliable copy. */
let memoryOnly = false

export async function writeClipboard(text: string): Promise<'system' | 'memory'> {
  memoryCopy = text
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      memoryOnly = false
      return 'system'
    }
  } catch {
    // permission denied or no focus: keep the in-memory copy
  }
  memoryOnly = true
  return 'memory'
}

export async function readClipboard(): Promise<ParseResult> {
  let systemText: string | null = null
  if (!memoryOnly) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) systemText = await navigator.clipboard.readText()
    } catch {
      systemText = null
    }
  }
  if (systemText !== null) return parseClipboardText(systemText)
  return memoryCopy !== null ? parseClipboardText(memoryCopy) : { ok: false, error: 'Nothing has been copied yet.' }
}

/** Test hook. */
export function resetClipboardMemory(): void {
  memoryCopy = null
  memoryOnly = false
}
