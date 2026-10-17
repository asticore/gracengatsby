import type { SectionNode } from '@/lib/sectionTree'
import { getElementDef } from '@/lib/elements/registry'
import { isDeniedNodeType } from '@/features/templateRepos/manifest'

import { getBlockDef } from './blockSchemas'
import { cloneNode, getList, getNode, stripEditorIds, type NodePath } from './treeOps'

/**
 * Copy/paste for the visual editor. The clipboard payload is plain JSON text so it travels
 * between pages, tabs and browser windows. Everything here except the two system-clipboard
 * helpers at the bottom is pure.
 */
export const CLIPBOARD_FORMAT = 'engage-template'
export const CLIPBOARD_FORMAT_STYLE = 'engage-style'
export const CLIPBOARD_SCHEMA_VERSION = 1

export type ClipboardKind = 'section' | 'block' | 'page'

export const CLIPBOARD_LIMITS = { maxChars: 1_000_000, maxDepth: 8, maxNodes: 300, maxRootNodes: 50, maxStringLength: 200_000 }
/** Import/export files may be larger than a clipboard paste. */
export const IMPORT_LIMITS = { maxChars: 5_000_000, maxNodes: 3_000, maxRootNodes: 500 }

export type ClipboardPayload = { format: typeof CLIPBOARD_FORMAT; schemaVersion: 1; kind: ClipboardKind; tree: SectionNode[] }
export type StyleClipboardPayload = {
  format: typeof CLIPBOARD_FORMAT_STYLE
  schemaVersion: 1
  design: unknown
  device: 'desktop' | 'tablet' | 'mobile'
}

export type Serialized = { kind: ClipboardKind; text: string; count: number }
export type StyleSerialized = { text: string }

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

/**
 * Shape and safety checks shared by paste and import. `counter.unknown` is null for paste (an unknown
 * block or element refuses the whole paste). For import it is a list: unknown types are kept and
 * recorded there instead, so the person can see them before importing.
 */
type NodeCounter = { n: number; maxNodes: number; unknown: string[] | null }

function checkNodes(nodes: unknown, depth: number, counter: NodeCounter): string | null {
  if (!Array.isArray(nodes)) return 'The copied content is not a list of blocks.'
  if (depth > CLIPBOARD_LIMITS.maxDepth) return 'The copied content is nested too deeply.'
  for (const node of nodes) {
    if (!isPlain(node)) return 'The copied content has an item that is not a block.'
    counter.n += 1
    if (counter.n > counter.maxNodes) return 'The copied content has too many blocks.'
    const blockType = node.blockType
    if (typeof blockType !== 'string' || !blockType) return 'The copied content has a block without a type.'
    if (isDeniedNodeType(blockType)) return `"${blockType}" content cannot be pasted.`
    if (!getBlockDef(blockType)) {
      if (!counter.unknown) return `This editor does not know the block type "${blockType}".`
      counter.unknown.push(`block:${blockType}`)
    }
    if (blockType === 'element') {
      const elementType = node.elementType
      if (typeof elementType !== 'string') return 'The copied content has an unknown element.'
      if (!getElementDef(elementType)) {
        if (!counter.unknown) return 'The copied content has an unknown element.'
        counter.unknown.push(`element:${elementType}`)
      }
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
  const problem = checkNodes(tree, 0, { n: 0, maxNodes: CLIPBOARD_LIMITS.maxNodes, unknown: null })
  if (problem) return { ok: false, error: problem }
  return { ok: true, kind: data.kind, nodes: tree as SectionNode[] }
}

export type StyleParseResult =
  | { ok: true; design: unknown; device: 'desktop' | 'tablet' | 'mobile' }
  | { ok: false; error: string }

export function parseStyleClipboardText(text: unknown): StyleParseResult {
  const notOurs: StyleParseResult = { ok: false, error: 'The clipboard does not hold anything copied from this editor.' }
  if (typeof text !== 'string' || !text.trim()) return notOurs
  if (text.length > CLIPBOARD_LIMITS.maxChars) return { ok: false, error: 'The copied content is too large to paste.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return notOurs
  }
  if (!isPlain(data) || data.format !== CLIPBOARD_FORMAT_STYLE) return notOurs
  if (data.schemaVersion !== CLIPBOARD_SCHEMA_VERSION) return { ok: false, error: 'The copied content comes from a different editor version.' }
  const device = data.device
  if (device !== 'desktop' && device !== 'tablet' && device !== 'mobile') {
    return { ok: false, error: 'The copied content has an invalid device.' }
  }
  const design = data.design
  if (design === undefined || design === null) return { ok: false, error: 'The copied content has no design.' }
  const designProblem = checkValue(design, 0)
  if (designProblem) return { ok: false, error: designProblem }
  return { ok: true, design, device }
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

/* ---------------------------------------------------------------------- */
/* Import / export of a whole page (JSON file or text)                      */
/* ---------------------------------------------------------------------- */

/** Total node count, including every block nested in sections' columns. */
export function countNodes(nodes: SectionNode[]): number {
  let total = 0
  for (const node of nodes) {
    total += 1
    if (Array.isArray(node.columns)) {
      for (const column of node.columns) total += countNodes(column.blocks || [])
    }
  }
  return total
}

/** Gives every node (and every column) a fresh client id. Same rule paste and insert use. */
export function withFreshIds(nodes: SectionNode[], makeId: () => string): SectionNode[] {
  return nodes.map((node) => cloneNode({ ...node, _id: undefined }, makeId))
}

/** The whole page as one engage-template document of kind "page". Editor-only ids are stripped. */
export function exportPage(blocks: SectionNode[]): { text: string; count: number; sections: number } {
  const payload: ClipboardPayload = {
    format: CLIPBOARD_FORMAT,
    schemaVersion: CLIPBOARD_SCHEMA_VERSION,
    kind: 'page',
    tree: stripEditorIds(blocks),
  }
  return {
    text: JSON.stringify(payload),
    count: countNodes(blocks),
    sections: blocks.filter((node) => node.blockType === 'section').length,
  }
}

/** A file name stem from a page title: lowercase ASCII, dashes between words. */
export function slugifyFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'page'
}

export type ImportSummary = {
  kind: ClipboardKind
  schemaVersion: number
  nodes: SectionNode[]
  sections: number
  elementCount: number
  /** Unknown block or element types. They are kept in `nodes` and flagged here, never dropped. */
  unknownTypes: string[]
}
export type ImportParseResult = { ok: true; summary: ImportSummary } | { ok: false; error: string }

/**
 * Lenient parse for an imported file. Refuses a wrong format or a newer schemaVersion, and
 * refuses unsafe content the same way paste does. Unknown block/element types are kept and listed.
 * Never throws.
 */
export function parsePageImport(text: unknown): ImportParseResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' }
  if (text.length > IMPORT_LIMITS.maxChars) return { ok: false, error: 'The file is too large to import (the limit is 5 MB).' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
  if (!isPlain(data)) return { ok: false, error: 'The file is not an engage-template document.' }
  if (data.format !== CLIPBOARD_FORMAT) {
    return { ok: false, error: `This is not an engage-template file (its format is ${JSON.stringify(data.format ?? null)}).` }
  }
  const version = data.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'The file has no valid schemaVersion.' }
  }
  if (version > CLIPBOARD_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `The file uses schemaVersion ${version}, but this editor only supports up to ${CLIPBOARD_SCHEMA_VERSION}. Update the editor before importing it.`,
    }
  }
  if (data.kind !== 'page' && data.kind !== 'section' && data.kind !== 'block') return { ok: false, error: 'The file has an unknown kind.' }
  const tree = data.tree
  if (!Array.isArray(tree) || tree.length === 0) return { ok: false, error: 'The file has no blocks.' }
  if (tree.length > IMPORT_LIMITS.maxRootNodes) return { ok: false, error: 'The file has too many top-level blocks.' }
  const unknown: string[] = []
  const problem = checkNodes(tree, 0, { n: 0, maxNodes: IMPORT_LIMITS.maxNodes, unknown })
  if (problem) return { ok: false, error: problem }
  const nodes = tree as SectionNode[]
  return {
    ok: true,
    summary: {
      kind: data.kind,
      schemaVersion: version,
      nodes,
      sections: nodes.filter((node) => node.blockType === 'section').length,
      elementCount: countNodes(nodes),
      unknownTypes: Array.from(new Set(unknown)),
    },
  }
}

let memoryCopy: string | null = null
/** True when the last write to the system clipboard failed, so memory is the only reliable copy. */
let memoryOnly = false
let styleMemoryCopy: string | null = null
let styleMemoryOnly = false

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

export function serializeStyle(design: unknown, device: 'desktop' | 'tablet' | 'mobile'): StyleSerialized | null {
  const payload: StyleClipboardPayload = {
    format: CLIPBOARD_FORMAT_STYLE,
    schemaVersion: CLIPBOARD_SCHEMA_VERSION,
    design,
    device,
  }
  return { text: JSON.stringify(payload) }
}

export async function writeStyleClipboard(text: string): Promise<'system' | 'memory'> {
  styleMemoryCopy = text
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      styleMemoryOnly = false
      return 'system'
    }
  } catch {
    // permission denied or no focus: keep the in-memory copy
  }
  styleMemoryOnly = true
  return 'memory'
}

export async function readStyleClipboard(): Promise<StyleParseResult> {
  let systemText: string | null = null
  if (!styleMemoryOnly) {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) systemText = await navigator.clipboard.readText()
    } catch {
      systemText = null
    }
  }
  if (systemText !== null) return parseStyleClipboardText(systemText)
  return styleMemoryCopy !== null ? parseStyleClipboardText(styleMemoryCopy) : { ok: false, error: 'Nothing has been copied yet.' }
}

/** Test hook. */
export function resetClipboardMemory(): void {
  memoryCopy = null
  memoryOnly = false
  styleMemoryCopy = null
  styleMemoryOnly = false
}
