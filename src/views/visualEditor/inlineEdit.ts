import type { SectionNode } from '@/lib/sectionTree'

import { pathKey, type NodePath } from './treeOps'
import { sanitizeInlineHtml } from './inlineFormat'
import { canEditAsPlainText, lexicalToPlainText, plainTextToLexical } from './richTextUtil'

/**
 * Pure helpers for editing element text in place on the canvas (double-click).
 * Only plain text is ever written. A Lexical value is editable only when
 * canEditAsPlainText says the round trip is lossless (same guard as the field panel).
 */

type PropSpec = { prop: string; kind: 'string' | 'lexical'; /** Text lives in items[i].text */ item?: boolean; /** The prop is rendered as HTML, so it may hold the sanitised rich subset. */ rich?: boolean }

/**
 * Props that may hold sanitised inline HTML. Only heading is rendered via SafeInlineHtml. Button/quote/list render plain React text and text-editor stores Lexical JSON, so none is rendered as HTML today. Set `rich: true` on a
 * spec in INLINE_PROPS only once its renderer outputs the prop as HTML.
 */

/** Which prop of each element type can be edited inline. */
export const INLINE_PROPS: Readonly<Record<string, PropSpec>> = {
  heading: { prop: 'text', kind: 'string', rich: true },
  button: { prop: 'text', kind: 'string' },
  quote: { prop: 'text', kind: 'string' },
  'text-editor': { prop: 'content', kind: 'lexical' },
  list: { prop: 'items', kind: 'string', item: true },
  'icon-list': { prop: 'items', kind: 'string', item: true },
}

export type InlineTarget = {
  /** Prop name on node.props (for list types this is 'items'). */
  field: string
  /** Index into items for list types. */
  itemIndex?: number
}

export type InlineCandidate = InlineTarget & { value: string; multiline: boolean; lexical: boolean; rich?: boolean }

const propsOf = (node: Pick<SectionNode, 'blockType'> & Record<string, unknown>): Record<string, unknown> | null => {
  const props = node.props
  return props && typeof props === 'object' && !Array.isArray(props) ? (props as Record<string, unknown>) : null
}

/** The editable text of `node` (for list types, of item `itemIndex`), or null when it must stay read-only. */
export function inlineCandidate(node: SectionNode | undefined, itemIndex = 0): InlineCandidate | null {
  if (!node) return null
  const n = node as unknown as Record<string, unknown>
  if (n.blockType !== 'element' || typeof n.elementType !== 'string') return null
  const spec = INLINE_PROPS[n.elementType]
  const props = propsOf(n as never)
  if (!spec || !props) return null
  const raw = props[spec.prop]
  if (spec.item) {
    if (!Array.isArray(raw)) return null
    const item = raw[itemIndex] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object' || typeof item.text !== 'string') return null
    return { field: spec.prop, itemIndex, value: item.text, multiline: false, lexical: false, rich: !!spec.rich }
  }
  if (spec.kind === 'lexical') {
    if (!canEditAsPlainText(raw)) return null
    return { field: spec.prop, value: lexicalToPlainText(raw), multiline: true, lexical: true }
  }
  if (typeof raw !== 'string') return null
  return { field: spec.prop, value: raw, multiline: n.elementType === 'quote', lexical: false, rich: !!spec.rich }
}

/** New node with the text replaced, or the same node when the target is not editable. Never rewrites rich content unless it is plain. */
export function writeInline(node: SectionNode, target: InlineTarget, rawValue: string): SectionNode {
  const current = inlineCandidate(node, target.itemIndex ?? 0)
  if (!current || current.field !== target.field) return node
  const value = current.rich ? sanitizeInlineHtml(rawValue) : rawValue
  const n = node as unknown as Record<string, unknown>
  const props = propsOf(n as never) as Record<string, unknown>
  if (current.value === value) return node
  let nextProps: Record<string, unknown>
  if (typeof target.itemIndex === 'number') {
    const items = (props[target.field] as Record<string, unknown>[]).map((it, i) => (i === target.itemIndex ? { ...it, text: value } : it))
    nextProps = { ...props, [target.field]: items }
  } else if (current.lexical) {
    nextProps = { ...props, [target.field]: plainTextToLexical(value) }
  } else {
    nextProps = { ...props, [target.field]: value }
  }
  return { ...n, props: nextProps } as unknown as SectionNode
}

const nodeAt = (blocks: SectionNode[], path: NodePath): SectionNode | undefined => {
  let list = blocks
  for (let i = 0; i < path.length; i += 2) {
    const node = list[path[i]]
    if (!node) return undefined
    if (i === path.length - 1) return node
    list = node.columns?.[path[i + 1]]?.blocks ?? []
  }
  return undefined
}

const replaceAt = (blocks: SectionNode[], path: NodePath, fn: (n: SectionNode) => SectionNode): SectionNode[] => {
  const [head, colIndex, ...rest] = path
  return blocks.map((node, i) => {
    if (i !== head) return node
    if (rest.length === 0) return fn(node)
    return {
      ...node,
      columns: (node.columns ?? []).map((c, ci) => (ci === colIndex ? { ...c, blocks: replaceAt(c.blocks ?? [], rest, fn) } : c)),
    } as SectionNode
  })
}

/** Applies an inline commit to the tree. Returns `blocks` itself (identity) when nothing changes. */
export function applyInlineEdit(blocks: SectionNode[], path: NodePath, target: InlineTarget, value: string): SectionNode[] {
  if (path.length % 2 !== 1) return blocks
  const node = nodeAt(blocks, path)
  if (!node) return blocks
  const next = writeInline(node, target, value)
  return next === node ? blocks : replaceAt(blocks, path, () => next)
}

/** Every inline-editable text in document order (Tab order). Locked nodes (per the canvas lock map) are skipped. */
export function listInlineTargets(
  blocks: SectionNode[],
  locks: Record<string, { blocked: boolean }> = {},
): { path: NodePath; itemIndex?: number }[] {
  const out: { path: NodePath; itemIndex?: number }[] = []
  const walk = (nodes: SectionNode[], base: NodePath) => {
    nodes.forEach((node, index) => {
      const path = [...base, index]
      if (locks[pathKey(path)]?.blocked) return
      if (node.columns) {
        node.columns.forEach((c, ci) => walk(c.blocks ?? [], [...path, ci]))
        return
      }
      const first = inlineCandidate(node, 0)
      if (!first) return
      if (first.itemIndex === undefined) {
        out.push({ path })
        return
      }
      const items = ((node as unknown as { props?: { items?: unknown[] } }).props?.items ?? []) as unknown[]
      items.forEach((_, i) => {
        if (inlineCandidate(node, i)) out.push({ path, itemIndex: i })
      })
    })
  }
  walk(blocks, [])
  return out
}

/** The neighbour of the current target in Tab order (wraps never; null at the ends). */
export function neighbourTarget(
  list: { path: NodePath; itemIndex?: number }[],
  current: { path: NodePath; itemIndex?: number },
  direction: 'next' | 'prev',
): { path: NodePath; itemIndex?: number } | null {
  const at = list.findIndex((t) => pathKey(t.path) === pathKey(current.path) && (t.itemIndex ?? 0) === (current.itemIndex ?? 0))
  if (at < 0) return null
  return list[at + (direction === 'next' ? 1 : -1)] ?? null
}

/* ---- commit / cancel reducer ---- */

export type InlineSession = { original: string; draft: string; done: 'commit' | 'cancel' | null }

export type InlineAction = { type: 'change'; value: string } | { type: 'commit' } | { type: 'cancel' }

export const startInline = (original: string): InlineSession => ({ original, draft: original, done: null })

/** Once a session is finished (commit or cancel) later actions are ignored, so blur after Enter/Esc cannot double-save. */
export function inlineReducer(state: InlineSession, action: InlineAction): InlineSession {
  if (state.done) return state
  if (action.type === 'change') return { ...state, draft: action.value }
  return { ...state, done: action.type }
}

/** The value to send to the parent when the session ends, or null when nothing should be written. */
export function inlineResult(state: InlineSession): string | null {
  return state.done === 'commit' && state.draft !== state.original ? state.draft : null
}
