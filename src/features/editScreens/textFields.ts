/**
 * Which string values inside a document are readable text, as opposed to
 * ids, URLs, class names, colours and settings. Shared by the reading-time
 * count and by find and replace, so both agree on what "the words on a page" are.
 *
 * Content is nested JSON (rich text trees, blocks, element props, section
 * columns). A string counts as text only when the key it sits under is on this
 * list; everything else is left alone. Pure, no imports.
 */

export const TEXT_KEYS: ReadonlySet<string> = new Set([
  'text',
  'heading',
  'subheading',
  'title',
  'subtitle',
  'description',
  'caption',
  'label',
  'content',
  'body',
  'buttonLabel',
  'buttonText',
  'primaryCtaLabel',
  'secondaryCtaLabel',
  'question',
  'answer',
  'quote',
])

/** Keys never entered at all: they hold styling or structure, not words. */
const SKIP_KEYS: ReadonlySet<string> = new Set(['id', 'blockType', 'blockName', 'design', 'style', 'direction', 'format', 'type', 'version', 'indent', 'mode', 'detail'])

const MAX_DEPTH = 40

/** Calls `visit` with every text string in the value, in document order. */
export function forEachText(value: unknown, visit: (text: string) => void, key = '', depth = 0): void {
  if (depth > MAX_DEPTH) return
  if (typeof value === 'string') {
    if (TEXT_KEYS.has(key)) visit(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) forEachText(entry, visit, key, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(childKey)) continue
      forEachText(child, visit, childKey, depth + 1)
    }
  }
}

/**
 * Returns a copy of the value with `transform` applied to every text string.
 * Anything that is not text is returned as it was. `changed` counts the strings
 * the transform altered.
 */
export function mapText(value: unknown, transform: (text: string) => string): { value: unknown; changed: number } {
  let changed = 0
  const walk = (node: unknown, key: string, depth: number): unknown => {
    if (depth > MAX_DEPTH) return node
    if (typeof node === 'string') {
      if (!TEXT_KEYS.has(key)) return node
      const next = transform(node)
      if (next !== node) changed += 1
      return next
    }
    if (Array.isArray(node)) return node.map((entry) => walk(entry, key, depth + 1))
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) {
        out[childKey] = SKIP_KEYS.has(childKey) ? child : walk(child, childKey, depth + 1)
      }
      return out
    }
    return node
  }
  return { value: walk(value, '', 0), changed }
}
