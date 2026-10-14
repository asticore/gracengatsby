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

/** Shown on a rich-text field the canvas can not represent without losing data. */
export const RICH_TEXT_NOTICE = 'This text uses formatting the visual editor can not edit. Edit it in the normal page editor.'

const isDefault = (value: unknown, fallback: unknown): boolean => value === undefined || value === fallback

function isPlainText(node: LexicalNode): boolean {
  return (
    node?.type === 'text' &&
    typeof node.text === 'string' &&
    isDefault(node.format, 0) &&
    isDefault(node.style, '') &&
    isDefault(node.mode, 'normal')
  )
}

function isPlainParagraph(node: LexicalNode): boolean {
  if (node?.type !== 'paragraph' || !isDefault(node.format, '') || !isDefault(node.indent, 0)) return false
  return Array.isArray(node.children) && (node.children as LexicalNode[]).every(isPlainText)
}

/**
 * True only when plainTextToLexical(lexicalToPlainText(value)) gives back the
 * same text and the same structure. That means every node is a plain paragraph
 * of unformatted text (no headings, lists, links, bold, alignment, line breaks),
 * no paragraph is empty, and no text has edge spaces or a forced blank line that
 * the blank-line split would change. A value that fails this check must be shown
 * read-only: writing it back from the canvas would silently change it.
 */
export function canEditAsPlainText(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const root = (value as LexicalRoot).root
  if (!root || root.type !== 'root' || !Array.isArray(root.children)) return false
  const paragraphs = root.children
  if (!paragraphs.every(isPlainParagraph)) return false
  const texts = paragraphs.map(flattenTextNode)
  // The editor's own empty value is one empty paragraph (or none at all).
  if (texts.every((text) => text === '')) return paragraphs.length <= 1
  return texts.every((text) => text.length > 0 && text === text.trim() && !/\n\s*\n/.test(text))
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
