/**
 * From-scratch replacement for `@payloadcms/richtext-lexical/react`'s
 * `RichText` component - the READ-SIDE renderer that turns stored Lexical
 * editor-state JSON into React elements on the frontend.
 *
 * Scope, deliberately narrow (see payload-removal-plan.md's "Rich text"
 * stage): this module replaces ONLY the frontend renderer. The Lexical
 * WYSIWYG *editing* UI in the admin panel (`src/engine/editor.ts`'s
 * `richTextEditor` factory, i.e. real Payload's `lexicalEditor()`) is
 * untouched and still comes from the real `@payloadcms/richtext-lexical`
 * package - that is Admin UI work, deferred to this project's Admin UI
 * stage. This module only has to read the JSON real Payload's editor
 * produces and render it identically; it never has to produce or validate
 * that JSON itself.
 *
 * Confirmed by direct inventory of this app's own code (haiku subagents,
 * cross-checked against `node_modules/@payloadcms/richtext-lexical@3.88.0`'s
 * own dist source read directly) before writing this file:
 *
 * - Every `richText` field in this app - `Events.description`,
 *   `Posts.content`, `Faqs.answer`, the ecommerce `Products.description`
 *   (`engage.config.ts`), and the `RichTextBlock`/`ImageText` blocks' own
 *   `content` fields - uses the SAME editor config: either an explicit
 *   `editor: richTextEditor()` call with NO arguments, or (for `Posts`/
 *   `Faqs`, which omit `editor` entirely) `engage.config.ts`'s own top-level
 *   `editor: richTextEditor()` default (also no arguments). There is
 *   exactly one feature set in this whole app, and it is real Payload's
 *   own `defaultEditorFeatures` (`dist/lexical/config/server/default.js`):
 *   Bold/Italic/Underline/Strikethrough/Subscript/Superscript/InlineCode,
 *   Paragraph, Heading, Align, Indent, UnorderedList/OrderedList/Checklist,
 *   Link, Relationship, Blockquote, Upload, HorizontalRule, and
 *   InlineToolbar (a toolbar-UI-only feature - it contributes no node type
 *   and needs no renderer support).
 * - Every one of this app's 6 frontend render sites
 *   (`RichTextBlock.tsx`/`ImageTextBlock.tsx`/`FaqList.tsx`/the blog, event,
 *   and shop detail pages) calls `<RichText data={...} />` with NO
 *   `converters`/`nodeMap` override - so the exact behavior to match is real
 *   Payload's OWN DEFAULT converter set
 *   (`dist/features/converters/lexicalToJSX/converter/defaultConverters.js`),
 *   not some app-specific customization.
 *
 * Node types handled below are exactly the ones real Payload's
 * `defaultJSXConverters` handles: text, paragraph, linebreak, quote
 * (blockquote), table/tablerow/tablecell (TableFeature isn't enabled here,
 * so table nodes can never actually appear in this app's stored content -
 * included anyway since the real default converter set includes it
 * unconditionally, and the cost of matching it is a handful of trivial
 * lines), heading, horizontalrule, list/listitem (incl. checklist),
 * link/autolink, upload, tab. `relationship` (from RelationshipFeature,
 * which IS enabled) has NO default converter in real Payload either - with
 * zero custom converters supplied, real Payload itself renders it as the
 * generic "unknown node" fallback, which is exactly what this module does
 * too (see `UNKNOWN_NODE` below) - genuine byte-for-byte parity, not a gap.
 * `block`/`inlineBlock` (BlocksFeature) are NOT in this app's feature set at
 * all - deliberately not implemented, matching "document the gap, don't
 * invent it away."
 *
 * **One separate, pre-existing, documented gap this module does NOT touch**:
 * real Payload's `UploadFeature` normally arrives at the frontend already
 * populated (`dist/features/upload/server/index.js`'s own `afterRead` hook
 * walks the stored Lexical JSON and swaps each embedded upload node's raw
 * relation id for the full media doc - `url`/`mimeType`/`sizes`/etc - before
 * any renderer ever sees it). This app's own from-scratch read pipeline
 * (`src/localapi/read-operations.ts`'s `traverseField`/`populateOne`)
 * already reproduces this population for plain `relationship`/`upload`
 * FIELD types, but does NOT walk into `richText` field JSON to populate
 * embedded upload/relationship NODES - confirmed by grep, there is no
 * `richText`-aware case anywhere in that traversal. That gap predates this
 * file (it has existed since the Stage 6e engine flip, independent of the
 * renderer) and stays open here: this component still renders an upload
 * node correctly WHEN `value` already happens to be a populated object
 * (matching real Payload's own `UploadJSXConverter`, which likewise
 * `return[s] null` when `value` isn't an object), but nothing yet populates
 * an unpopulated one. The natural place to close it is this project's
 * Uploads stage (next in the work order), which will need a real media
 * model in place first regardless. No evidence this app's own seed/dev
 * content actually embeds an upload or relationship node inside any
 * `richText` field today (sampled the live dev D1 directly - every stored
 * value observed was a plain paragraph), so this is headroom, not an active
 * production bug.
 *
 * The tree-walk/align/indent logic below is a line-for-line port of real
 * Payload's own `convertLexicalNodesToJSX`
 * (`dist/features/converters/lexicalToJSX/converter/index.js`), read
 * directly rather than guessed at, including its specific quirks: `indent`
 * styling is skipped for `listitem` nodes (list items get their indent from
 * nesting, not padding), and align/indent styles are merged onto whatever
 * element the type-specific converter already returned (via a clone), not
 * wrapped in an extra element.
 *
 * One deliberate substitution: real Payload's checklist item converter
 * calls `uuidv4()` from the `uuid` npm package to link each checkbox
 * `<input>` to its `<label>`. This project's standing policy is zero new
 * runtime dependencies to reproduce vendor behavior - `crypto.randomUUID()`
 * (a Web/Node/Workers platform built-in, already used elsewhere in this
 * project's from-scratch modules) does the same job. The exact ID value is
 * not part of the wire contract either way - both implementations mint a
 * fresh random one on every render - so this substitution is invisible to
 * anything that isn't literally diffing this render against a previous one.
 */
import type { ReactElement, ReactNode } from 'react'

import * as React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Deliberately loose: this is arbitrary, editor-authored JSON, not a shape
 * this app's own type system controls. Real Payload's own `SerializedLexicalNode`
 * union is similarly a `Record<string, unknown>` grab-bag underneath - see
 * its own `dist/nodeTypes.d.ts`. Narrowing per-converter below reads the
 * specific fields each node type is documented (above) to carry.
 */
export type LexicalNode = { type: string } & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- see doc comment above

export interface SerializedLexicalDoc {
  root?: {
    children?: LexicalNode[]
  } | null
}

type ConverterArgs = {
  node: LexicalNode
  parent: LexicalNode
  convertChildren: (nodes: LexicalNode[] | undefined, parent: LexicalNode) => ReactNode[]
}

type Converter = (args: ConverterArgs) => ReactNode

// ---------------------------------------------------------------------------
// hasText - matches dist/validate/hasText.js exactly: an editor state with
// no nodes, or only a single empty paragraph, is treated as "no content".
// ---------------------------------------------------------------------------

function hasText(value: unknown): value is SerializedLexicalDoc {
  const doc = value as SerializedLexicalDoc | null | undefined
  const children = doc?.root?.children
  const hasChildren = !!children?.length
  if (!hasChildren) return false

  let hasOnlyEmptyParagraph = false
  if (children!.length === 1) {
    const first = children![0]
    if (first?.type === 'paragraph') {
      const kids = first.children as LexicalNode[] | undefined
      if (!kids || kids.length === 0) {
        hasOnlyEmptyParagraph = true
      }
      else if (kids.length === 1) {
        const onlyChild = kids[0]
        if (onlyChild?.type === 'text' && !onlyChild.text?.length) {
          hasOnlyEmptyParagraph = true
        }
      }
    }
  }
  return !hasOnlyEmptyParagraph
}

// ---------------------------------------------------------------------------
// Text formatting - Lexical's own bit values, copied from
// dist/lexical/utils/nodeFormat.js (itself copy-pasted there from Lexical
// core). IS_HIGHLIGHT (1 << 7) exists in that file but is deliberately
// unhandled below too: real Payload's own TextJSXConverter never checks it
// either (HighlightFeature isn't enabled by this app in any case).
// ---------------------------------------------------------------------------

const IS_BOLD = 1
const IS_ITALIC = 1 << 1
const IS_STRIKETHROUGH = 1 << 2
const IS_UNDERLINE = 1 << 3
const IS_CODE = 1 << 4
const IS_SUBSCRIPT = 1 << 5
const IS_SUPERSCRIPT = 1 << 6

/** Port of TextJSXConverter (converters/text.js). Wrapping order matters. */
function convertText({ node }: ConverterArgs): ReactNode {
  let text: ReactNode = node.text
  const format = Number(node.format) || 0
  if (format & IS_BOLD) text = <strong>{text}</strong>
  if (format & IS_ITALIC) text = <em>{text}</em>
  if (format & IS_STRIKETHROUGH) text = <span style={{ textDecoration: 'line-through' }}>{text}</span>
  if (format & IS_UNDERLINE) text = <span style={{ textDecoration: 'underline' }}>{text}</span>
  if (format & IS_CODE) text = <code>{text}</code>
  if (format & IS_SUBSCRIPT) text = <sub>{text}</sub>
  if (format & IS_SUPERSCRIPT) text = <sup>{text}</sup>
  return text
}

/** Port of ParagraphJSXConverter. An empty paragraph renders `<p><br/></p>`. */
function convertParagraph({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  if (!children.length) return <p><br /></p>
  return <p>{children}</p>
}

/** Port of HeadingJSXConverter. `node.tag` is one of h1-h6. */
function convertHeading({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  const Tag = node.tag as keyof React.JSX.IntrinsicElements
  return <Tag>{children}</Tag>
}

/** Port of BlockquoteJSXConverter (node.type === 'quote'). */
function convertQuote({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  return <blockquote>{children}</blockquote>
}

/** Port of HorizontalRuleJSXConverter / LinebreakJSXConverter / TabJSXConverter. */
function convertHorizontalRule(): ReactNode {
  return <hr />
}
function convertLinebreak(): ReactNode {
  return <br />
}
function convertTab(): ReactNode {
  return '\t'
}

/**
 * Port of ListJSXConverter's `list`/`listitem` entries, including the
 * checklist branch. `parent` is the enclosing node (the list, for a
 * listitem) - matches real Payload's own converter, which reads
 * `parent.listType === 'check'` to decide whether an item is a checkbox.
 */
function convertList({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  const Tag = node.tag as keyof React.JSX.IntrinsicElements
  return <Tag className={`list-${node?.listType}`}>{children}</Tag>
}

function convertListItem({ node, parent, convertChildren }: ConverterArgs): ReactNode {
  const kids = (node.children ?? []) as LexicalNode[]
  const hasSubLists = kids.some(child => child.type === 'list')
  const children = convertChildren(node.children, node)

  if (parent?.listType === 'check') {
    const uid = crypto.randomUUID()
    return (
      <li
        aria-checked={node.checked ? 'true' : 'false'}
        className={`list-item-checkbox${node.checked ? ' list-item-checkbox-checked' : ' list-item-checkbox-unchecked'}${hasSubLists ? ' nestedListItem' : ''}`}
        role="checkbox"
        style={{ listStyleType: 'none' }}
        tabIndex={-1}
        value={node?.value}
      >
        {hasSubLists
          ? children
          : (
              <>
                <input checked={node.checked} id={uid} readOnly type="checkbox" />
                <label htmlFor={uid}>{children}</label>
                <br />
              </>
            )}
      </li>
    )
  }

  return (
    <li className={hasSubLists ? 'nestedListItem' : ''} style={hasSubLists ? { listStyleType: 'none' } : undefined} value={node?.value}>
      {children}
    </li>
  )
}

/**
 * Port of LinkJSXConverter, called with no `internalDocToHref` - matching
 * every call site in this app, which supplies no converters/overrides at
 * all. Real Payload's own fallback for an internal link with no resolver
 * is `href='#'` plus a `console.error` - reproduced verbatim rather than
 * inventing a slug-resolution scheme this app never asked for.
 */
function convertLink({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  const rel = node.fields?.newTab ? 'noopener noreferrer' : undefined
  const target = node.fields?.newTab ? '_blank' : undefined
  let href = node.fields?.url ?? ''
  if (node.fields?.linkType === 'internal') {
    console.error('RichText: Link converter: found internal link, but internalDocToHref is not provided')
    href = '#'
  }
  return <a href={href} rel={rel} target={target}>{children}</a>
}

/**
 * Port of UploadJSXConverter exactly, including its three branches (link
 * for non-images, plain `<img>` for a sizeless image, `<picture>` with
 * `<source>` entries otherwise) and its `return null` when `value` is not
 * yet a populated object - see this file's header comment for why that can
 * still happen in this app today.
 */
function convertUpload({ node }: ConverterArgs): ReactNode {
  const value = node.value
  if (typeof value !== 'object' || value === null) return null

  const doc = value as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- populated upload doc shape, same rationale as LexicalNode above
  const alt = node.fields?.alt || doc.alt || ''
  const url = doc.url

  if (!doc.mimeType?.startsWith('image')) {
    return <a href={url} rel="noopener noreferrer">{doc.filename}</a>
  }

  const sizes = doc.sizes as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any -- see LexicalNode doc comment above
  if (!sizes || !Object.keys(sizes).length) {
    // eslint-disable-next-line @next/next/no-img-element -- parity with real Payload's UploadJSXConverter, which always renders a plain <img>
    return <img alt={alt} height={doc.height} src={url} width={doc.width} />
  }

  const sources: ReactNode[] = []
  for (const sizeName of Object.keys(sizes)) {
    const size = sizes[sizeName]
    if (!size || !size.width || !size.height || !size.mimeType || !size.filesize || !size.filename || !size.url) continue
    sources.push(<source key={sizeName} media={`(max-width: ${size.width}px)`} srcSet={size.url} type={size.mimeType} />)
  }
  // eslint-disable-next-line @next/next/no-img-element -- parity with real Payload's UploadJSXConverter, which always renders a plain <img>
  sources.push(<img alt={alt} height={doc.height} key="image" src={url} width={doc.width} />)
  return <picture>{sources}</picture>
}

/** Port of TableJSXConverter's three node types. See this file's header comment - unreachable in this app's own stored content (TableFeature isn't enabled), included for exact parity with real Payload's unconditional defaultJSXConverters anyway. */
function convertTable({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  return (
    <div className="lexical-table-container">
      <table className="lexical-table" style={{ borderCollapse: 'collapse' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
function convertTableRow({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  return <tr className="lexical-table-row">{children}</tr>
}
function convertTableCell({ node, convertChildren }: ConverterArgs): ReactNode {
  const children = convertChildren(node.children, node)
  const Tag = (node.headerState > 0 ? 'th' : 'td') as keyof React.JSX.IntrinsicElements
  const colSpan = node.colSpan && node.colSpan > 1 ? node.colSpan : undefined
  const rowSpan = node.rowSpan && node.rowSpan > 1 ? node.rowSpan : undefined
  return (
    <Tag
      className={`lexical-table-cell lexical-table-cell-header-${node.headerState}`}
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={{ backgroundColor: node.backgroundColor || undefined, border: '1px solid #ccc', padding: '8px' }}
    >
      {children}
    </Tag>
  )
}

/**
 * The default converter set - real Payload's own `defaultJSXConverters`
 * (defaultConverters.js), one entry per node type string. `relationship`
 * (and `block`/`inlineBlock`) are deliberately absent - see header comment.
 */
const DEFAULT_CONVERTERS: Record<string, Converter> = {
  text: convertText,
  paragraph: convertParagraph,
  linebreak: convertLinebreak,
  quote: convertQuote,
  table: convertTable,
  tablerow: convertTableRow,
  tablecell: convertTableCell,
  heading: convertHeading,
  horizontalrule: convertHorizontalRule,
  list: convertList,
  listitem: convertListItem,
  link: convertLink,
  autolink: convertLink,
  upload: convertUpload,
  tab: convertTab,
}

const UNKNOWN_NODE: ReactElement = <span>unknown node</span>

// ---------------------------------------------------------------------------
// Tree walk - port of convertLexicalNodesToJSX (converter/index.js),
// including its align/indent style-merging quirks (indent skipped for
// listitem; style merged onto the converter's own returned element via
// clone, not wrapped).
// ---------------------------------------------------------------------------

function applyAlignAndIndent(node: LexicalNode, reactNode: ReactNode, key: number): ReactNode {
  const style: Record<string, string> = {}

  if ('format' in node && node.format) {
    switch (node.format) {
      case 'center':
        style.textAlign = 'center'
        break
      case 'end':
        style.textAlign = 'right'
        break
      case 'justify':
        style.textAlign = 'justify'
        break
      case 'right':
        style.textAlign = 'right'
        break
      case 'start':
        style.textAlign = 'left'
        break
      // 'left' (and any other/no-op string) intentionally applies no style,
      // matching real Payload's own switch statement exactly.
    }
  }

  if ('indent' in node && node.indent && node.type !== 'listitem') {
    // Unit and multiplier (px, 40) are load-bearing per real Payload's own
    // comment (payloadcms/payload#13130) - do not change.
    style.paddingInlineStart = `${Number(node.indent) * 40}px`
  }

  if (React.isValidElement(reactNode)) {
    if (style.textAlign || style.paddingInlineStart) {
      const el = reactNode as ReactElement<{ style?: React.CSSProperties }>
      return React.cloneElement(el, { key, style: { ...style, ...(el.props.style ?? {}) } })
    }
    return React.cloneElement(reactNode, { key })
  }
  return reactNode
}

function convertNodes(nodes: LexicalNode[] | undefined, parent: LexicalNode, converters: Record<string, Converter>): ReactNode[] {
  if (!nodes) return []
  const results = nodes.map((node, i) => {
    const converter = converters[node.type]
    let reactNode: ReactNode
    try {
      reactNode = converter
        ? converter({
            node,
            parent,
            convertChildren: (kids, kidsParent) => convertNodes(kids, kidsParent, converters),
          })
        : UNKNOWN_NODE
    }
    catch (err) {
      console.error('RichText: error converting lexical node to JSX:', err, 'node:', node)
      reactNode = null
    }
    return applyAlignAndIndent(node, reactNode, i)
  })
  return results.filter(node => node !== null && node !== undefined && node !== false)
}

// ---------------------------------------------------------------------------
// Public component - matches @payloadcms/richtext-lexical/react's own
// `RichText` prop surface for the subset this app actually uses. `nodeMap`
// and a function form of `converters` (both for BlocksFeature/inlineBlocks,
// which this app doesn't enable - see header comment) are deliberately not
// supported; every call site in this app passes only `data`.
// ---------------------------------------------------------------------------

export interface RichTextProps {
  className?: string
  converters?: Record<string, Converter>
  data?: unknown
  disableContainer?: boolean
  disableIndent?: boolean | string[]
  disableTextAlign?: boolean | string[]
}

export function RichText({ className, converters, data, disableContainer }: RichTextProps): ReactElement | null {
  if (!data) return null
  if (!hasText(data)) {
    return disableContainer ? null : <div className={className ?? 'payload-richtext'} />
  }

  const doc = data as SerializedLexicalDoc
  const merged = converters ? { ...DEFAULT_CONVERTERS, ...converters } : DEFAULT_CONVERTERS
  const content = convertNodes(doc.root!.children, doc.root as LexicalNode, merged)

  if (disableContainer) return <>{content}</>
  return <div className={className ?? 'payload-richtext'}>{content}</div>
}
