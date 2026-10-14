/**
 * Builders for the Lexical editor-state JSON this app stores in rich text
 * fields (the same shape src/localapi/richtext.tsx renders).
 */

export type LexicalNode = { type: string; [key: string]: unknown }

export const FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
} as const

const base = { version: 1, direction: 'ltr', format: '', indent: 0 }

export function textNode(text: string, format = 0): LexicalNode {
  return { type: 'text', version: 1, text, format, style: '', mode: 'normal', detail: 0 }
}

export function lineBreak(): LexicalNode {
  return { type: 'linebreak', version: 1 }
}

export function paragraph(children: LexicalNode[]): LexicalNode {
  return { type: 'paragraph', ...base, textFormat: 0, textStyle: '', children }
}

export function heading(tag: 'h1' | 'h2' | 'h3' | 'h4', children: LexicalNode[]): LexicalNode {
  return { type: 'heading', tag, ...base, children }
}

export function quote(children: LexicalNode[]): LexicalNode {
  return { type: 'quote', ...base, children }
}

export function horizontalRule(): LexicalNode {
  return { type: 'horizontalrule', version: 1 }
}

export function link(url: string, newTab: boolean, children: LexicalNode[]): LexicalNode {
  return { type: 'link', ...base, fields: { linkType: 'custom', url, newTab }, children }
}

export function listNode(ordered: boolean, items: LexicalNode[]): LexicalNode {
  const numbered = items.map((item, index) => ({ ...item, value: index + 1 }))
  return {
    type: 'list',
    ...base,
    listType: ordered ? 'number' : 'bullet',
    tag: ordered ? 'ol' : 'ul',
    start: 1,
    children: numbered,
  }
}

export function listItem(children: LexicalNode[]): LexicalNode {
  return { type: 'listitem', ...base, value: 1, children }
}

/** A full editor state: a root with the given top-level nodes (may be empty). */
export function lexicalRoot(children: LexicalNode[]): Record<string, unknown> {
  return { root: { type: 'root', ...base, children } }
}

/** Plain text as a one-paragraph editor state. */
export function plainParagraph(text: string): Record<string, unknown> {
  return lexicalRoot([paragraph(text ? [textNode(text)] : [])])
}

/** True when the nodes hold visible text, a line break or a horizontal rule. */
export function hasVisibleContent(nodes: LexicalNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === 'text') return String(node.text ?? '').trim().length > 0
    if (node.type === 'linebreak' || node.type === 'horizontalrule') return true
    return Array.isArray(node.children) && hasVisibleContent(node.children as LexicalNode[])
  })
}

/** Appends text, merging into the previous text node when the formatting matches. */
export function pushText(out: LexicalNode[], text: string, format: number): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text' && last.format === format) {
    last.text = String(last.text) + text
    return
  }
  out.push(textNode(text, format))
}

/** Removes leading and trailing whitespace-only text and line breaks; collapses nothing else. */
export function trimInline(nodes: LexicalNode[]): LexicalNode[] {
  const out = nodes.map((node) => ({ ...node }))
  while (out.length && (out[0].type === 'linebreak' || (out[0].type === 'text' && String(out[0].text).trim() === ''))) out.shift()
  while (out.length && (out[out.length - 1].type === 'linebreak' || (out[out.length - 1].type === 'text' && String(out[out.length - 1].text).trim() === ''))) out.pop()
  if (out.length && out[0].type === 'text') out[0].text = String(out[0].text).replace(/^\s+/, '')
  const lastNode = out[out.length - 1]
  if (lastNode && lastNode.type === 'text') lastNode.text = String(lastNode.text).replace(/\s+$/, '')
  return out
}
