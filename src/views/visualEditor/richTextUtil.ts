/**
 * Minimal, dependency-free bridge between Lexical's richText JSON shape and
 * plain text, so the visual editor's canvas can offer a simple textarea for
 * rich text fields instead of embedding a full Lexical editor instance.
 *
 * Paragraphs are separated by a blank line. This intentionally does not
 * round-trip bold/italic/links/headings - it's a v1 tradeoff that keeps the
 * canvas fast and dependency-free. Anything that needs full rich formatting
 * can still be edited from the normal portal admin field.
 */

type LexicalNode = {
  type: string
  version: number
  [key: string]: unknown
}

type LexicalRoot = {
  root: {
    type: 'root'
    children: LexicalNode[]
    direction: 'ltr' | null
    format: string
    indent: number
    version: number
  }
}

/**
 * True when a Lexical value carries formatting the plain-text bridge above
 * cannot round-trip - bold/italic/underline/etc. (a non-zero `format` bitmask
 * on a text node), or any node type besides a plain paragraph of text (a
 * heading, list, link, quote, code block, and so on).
 *
 * Used to stop `plainTextToLexical` from silently flattening a value that
 * already has real formatting: a field that fails this check is safe to
 * edit as plain text and write back losslessly, one that passes it is not.
 */
export function hasRichFormatting(value: unknown): boolean {
  const root = (value as LexicalRoot | null | undefined)?.root
  if (!root?.children?.length) return false
  return root.children.some(nodeHasFormatting)
}

function nodeHasFormatting(node: LexicalNode): boolean {
  if (node.type === 'text') {
    return typeof node.format === 'number' && node.format !== 0
  }
  if (node.type !== 'paragraph') return true
  const children = (node.children as LexicalNode[] | undefined) || []
  return children.some(nodeHasFormatting)
}

export function lexicalToPlainText(value: unknown): string {
  const root = (value as LexicalRoot | null | undefined)?.root
  if (!root?.children?.length) return ''

  const paragraphs: string[] = []
  for (const node of root.children) {
    const text = flattenTextNode(node)
    paragraphs.push(text)
  }
  return paragraphs.join('\n\n')
}

function flattenTextNode(node: LexicalNode): string {
  const children = (node.children as LexicalNode[] | undefined) || []
  if (children.length === 0) {
    return typeof node.text === 'string' ? node.text : ''
  }
  return children.map(flattenTextNode).join('')
}

export function plainTextToLexical(text: string): LexicalRoot {
  const paragraphs = (text || '').split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  const children: LexicalNode[] =
    paragraphs.length > 0
      ? paragraphs.map((p) => ({
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: p.trim(), format: 0, style: '', mode: 'normal', detail: 0 }],
          direction: 'ltr',
          format: '',
          indent: 0,
        }))
      : [
          {
            type: 'paragraph',
            version: 1,
            children: [],
            direction: 'ltr',
            format: '',
            indent: 0,
          },
        ]

  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}