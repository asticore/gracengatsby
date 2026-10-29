/**
 * Rich text (Lexical) at the text-node level.
 *
 * A rich text field is not one translatable string. Each text node in its tree
 * becomes a sub-field addressed `<field>#<index path>`, e.g. `content#2.0` is
 * the first text node inside the third top-level block. Because each sub-field
 * is a plain string, the existing machinery (stored rows, machine drafts,
 * staleness, the overlay, the rollups and the translate panel) handles it
 * without knowing it came from a tree.
 *
 * Only text the reader sees is addressed: code blocks and code-formatted runs
 * are skipped. URLs, ids and decorator nodes (uploads, embeds) hold no text
 * node, so they are never addressed. Link text is addressed; the URL is not.
 *
 * The index path is positional, so inserting, deleting or reordering blocks
 * shifts the paths after it. Those rows then become outdated or inactive, which
 * hides them from the public site until somebody checks them. It never shows
 * the text against the wrong node.
 *
 * Pure: no engine, no request, edge-safe.
 */

type Node = Record<string, unknown>

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Lexical's inline code format bit. */
const FORMAT_CODE = 16

/** Block types whose text is never translated. */
const SKIPPED_BLOCKS = new Set(['code'])

/** `<field>#<index path>`, e.g. `content#2.0`. Field names never contain '#'. */
const RICH_PATH = /^([A-Za-z_]\w*)#(\d+(?:\.\d+)*)$/

export type RichTextPath = { field: string; indexPath: number[] }

export function parseRichTextPath(path: string): RichTextPath | null {
  const match = RICH_PATH.exec(path)
  if (!match) return null
  return { field: match[1], indexPath: match[2].split('.').map(Number) }
}

export const richTextPath = (field: string, indexPath: readonly number[]): string => `${field}#${indexPath.join('.')}`

/** The tree root: a Lexical document is `{ root: { children } }`, and a bare root is accepted too. */
function rootOf(value: unknown): Node | null {
  let source: unknown = value
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch {
      return null
    }
  }
  if (!isNode(source)) return null
  if (isNode(source.root)) return source.root
  return source
}

const KIND_LABEL: Record<string, string> = {
  paragraph: 'Paragraph',
  heading: 'Heading',
  listitem: 'List item',
  quote: 'Quote',
  tablecell: 'Table cell',
  caption: 'Caption',
}

export type RichTextTextNode = {
  indexPath: number[]
  text: string
  /** The nearest block this text sits in, e.g. 'paragraph' or 'heading'. */
  blockType: string
}

/** Every translatable text node in the tree, in document order. Empty text is not addressed. */
export function extractRichTextNodes(value: unknown): RichTextTextNode[] {
  const root = rootOf(value)
  if (!root) return []
  const out: RichTextTextNode[] = []

  const walk = (node: Node, indexPath: number[], blockType: string, inCode: boolean): void => {
    const children = Array.isArray(node.children) ? node.children : []
    children.forEach((child, index) => {
      if (!isNode(child)) return
      const here = [...indexPath, index]
      const type = typeof child.type === 'string' ? child.type : ''
      if (type === 'text') {
        const format = typeof child.format === 'number' ? child.format : 0
        const text = typeof child.text === 'string' ? child.text : ''
        if (!inCode && (format & FORMAT_CODE) === 0 && text.trim().length > 0) {
          out.push({ indexPath: here, text, blockType })
        }
        return
      }
      if (SKIPPED_BLOCKS.has(type)) return
      const nextBlock = KIND_LABEL[type] ? type : blockType
      walk(child, here, nextBlock, inCode)
    })
  }

  walk(root, [], 'paragraph', false)
  return out
}

/** The text of one addressed node, or undefined when the path no longer exists. */
export function readRichTextNode(value: unknown, indexPath: readonly number[]): string | undefined {
  let node: unknown = rootOf(value)
  for (const index of indexPath) {
    if (!isNode(node) || !Array.isArray(node.children)) return undefined
    node = node.children[index]
  }
  if (!isNode(node) || node.type !== 'text' || typeof node.text !== 'string') return undefined
  return node.text
}

/**
 * Returns a copy of the document with one text node's text replaced. Copies only
 * the path to that node. A path that does not resolve to a text node leaves the
 * document unchanged. A string-stored tree stays a string.
 */
export function writeRichTextNode(value: unknown, indexPath: readonly number[], text: string): unknown {
  const wasString = typeof value === 'string'
  const parsed: unknown = wasString ? safeParse(value as string) : value
  if (!isNode(parsed)) return value
  const hasWrapper = isNode(parsed.root)

  const replaceAt = (node: Node, path: readonly number[]): Node | null => {
    if (path.length === 0) {
      if (node.type !== 'text') return null
      return { ...node, text }
    }
    if (!Array.isArray(node.children)) return null
    const [head, ...rest] = path
    const child = node.children[head]
    if (!isNode(child)) return null
    const next = replaceAt(child, rest)
    if (!next) return null
    const children = [...node.children]
    children[head] = next
    return { ...node, children }
  }

  const rootNode = hasWrapper ? (parsed.root as Node) : parsed
  const nextRoot = replaceAt(rootNode, indexPath)
  if (!nextRoot) return value
  const next = hasWrapper ? { ...parsed, root: nextRoot } : nextRoot
  return wasString ? JSON.stringify(next) : next
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The sub-field descriptions for one rich text field of a document. */
export function richTextSubFields(args: { field: string; label: string; value: unknown }): Array<{
  path: string
  label: string
  size: 'text' | 'long'
  kind: string
  text: string
  ordinal: number
}> {
  return extractRichTextNodes(args.value).map((node, ordinal) => ({
    path: richTextPath(args.field, node.indexPath),
    label: `${KIND_LABEL[node.blockType] ?? 'Text'} ${ordinal + 1}`,
    size: node.text.length > 80 ? 'long' : 'text',
    kind: node.blockType,
    text: node.text,
    ordinal,
  }))
}
