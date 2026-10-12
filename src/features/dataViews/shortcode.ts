/**
 * The text forms that place a view inside rich text:
 *
 *   [data-view id="3"]   [data-view slug="sales-by-month"]   {{data-view:sales-by-month}}   {{data-view:3}}
 *
 * A form takes effect when it is the whole content of a paragraph (so a view is a block, never
 * squeezed into a sentence). Anywhere else the text is left as written. Pure.
 */

const BRACKET = /^\[data-view\s+(?:id|slug)\s*=\s*"?([a-z0-9][a-z0-9-]{0,59})"?\s*\]$/i
const BRACES = /^\{\{\s*data-view:([a-z0-9][a-z0-9-]{0,59})\s*\}\}$/i

/** The reference named by a paragraph's text, or null when the text is anything else. */
export function viewRefFromText(text: string): string | null {
  const trimmed = text.trim()
  const match = BRACKET.exec(trimmed) ?? BRACES.exec(trimmed)
  return match ? match[1]!.toLowerCase() : null
}

type RichNode = { type?: string; text?: unknown; children?: unknown }

const plainText = (node: unknown): string => {
  if (!node || typeof node !== 'object') return ''
  const n = node as RichNode
  if (typeof n.text === 'string') return n.text
  return Array.isArray(n.children) ? n.children.map(plainText).join('') : ''
}

export type ViewSegment<T> = { type: 'nodes'; nodes: T[] } | { type: 'view'; ref: string }

/** True when any top-level paragraph is a view shortcode. Cheap check so the common page costs nothing. */
export function hasViewShortcode(nodes: readonly unknown[]): boolean {
  return nodes.some((node) => (node as RichNode)?.type === 'paragraph' && viewRefFromText(plainText(node)) !== null)
}

/** Splits top-level rich text nodes into runs of ordinary content and view placements. */
export function splitViewShortcodes<T>(nodes: readonly T[]): ViewSegment<T>[] {
  const out: ViewSegment<T>[] = []
  let run: T[] = []
  for (const node of nodes) {
    const ref = (node as RichNode)?.type === 'paragraph' ? viewRefFromText(plainText(node)) : null
    if (ref) {
      if (run.length) out.push({ type: 'nodes', nodes: run })
      run = []
      out.push({ type: 'view', ref })
    } else run.push(node)
  }
  if (run.length) out.push({ type: 'nodes', nodes: run })
  return out
}
