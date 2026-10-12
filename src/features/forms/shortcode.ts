/**
 * The `[form id="..."]` shortcode in rich text.
 *
 * Only a paragraph that holds nothing but the shortcode counts, so a form is
 * never injected into the middle of a sentence and the text of a page that
 * merely talks about the syntax is left alone. `id` is the form's numeric id or
 * its public embed key.
 */

const SHORTCODE = /^\s*\[form\s+(?:id|key)\s*=\s*["']?([A-Za-z0-9_-]{1,60})["']?\s*\]\s*$/i

type RichNode = { type?: string; text?: string; children?: RichNode[] }

const plainText = (node: RichNode): string => (typeof node.text === 'string' ? node.text : (node.children || []).map(plainText).join(''))

/** The form id/key a paragraph asks for, or null when it is not a shortcode paragraph. */
export function shortcodeFormId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const rich = node as RichNode
  if (rich.type !== 'paragraph') return null
  const match = SHORTCODE.exec(plainText(rich))
  return match ? match[1] : null
}

export type RichSegment = { type: 'nodes'; nodes: unknown[] } | { type: 'form'; id: string }

/** Splits rich-text nodes around shortcode paragraphs. A text with none comes back as one `nodes` segment. */
export function splitFormShortcodes(nodes: unknown[]): RichSegment[] {
  const segments: RichSegment[] = []
  let run: unknown[] = []
  for (const node of nodes || []) {
    const id = shortcodeFormId(node)
    if (id === null) {
      run.push(node)
      continue
    }
    if (run.length) segments.push({ type: 'nodes', nodes: run })
    run = []
    segments.push({ type: 'form', id })
  }
  if (run.length) segments.push({ type: 'nodes', nodes: run })
  return segments
}

export const hasFormShortcode = (nodes: unknown[]): boolean => (nodes || []).some((node) => shortcodeFormId(node) !== null)
