/**
 * A small, forgiving markup reader for XML (WordPress exports) and HTML
 * (post bodies). It never throws: unclosed tags are closed at the end, stray
 * closing tags are ignored, and comments, doctypes and processing
 * instructions are dropped. Text runs become "#text" nodes; CDATA is kept raw.
 */

import { decodeEntities } from './entities'

export type MarkupNode = {
  /** Tag name, "#text" for a text run, or "#root" for the document. */
  name: string
  attrs: Record<string, string>
  children: MarkupNode[]
  /** Text for "#text" nodes and raw bodies of script/style. */
  text: string
}

export type MarkupOptions = {
  /** Tags that never have content (img, br, ...). */
  voidTags?: ReadonlySet<string>
  /** Tags whose body is raw text (script, style): nothing inside is parsed. */
  rawText?: ReadonlySet<string>
  /** Return true when an incoming tag must close the open tag on top of the stack. */
  autoClose?: (open: string, incoming: string) => boolean
  /** Lower-case every tag and attribute name (HTML). Keep case for XML. */
  lowerCase?: boolean
}

const OPEN_TAG = /<([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y
const CLOSE_TAG = /<\/([A-Za-z][\w:.-]*)\s*>/y
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const BOM = 0xfeff

function node(name: string, attrs: Record<string, string> = {}): MarkupNode {
  return { name, attrs, children: [], text: '' }
}

function parseAttrs(body: string, lowerCase: boolean): Record<string, string> {
  const attrs: Record<string, string> = {}
  ATTR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTR.exec(body)) !== null) {
    const key = lowerCase ? match[1].toLowerCase() : match[1]
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (!(key in attrs)) attrs[key] = decodeEntities(value)
  }
  return attrs
}

function addText(top: MarkupNode, text: string, raw: boolean): void {
  if (!text) return
  const child = node('#text')
  child.text = raw ? text : decodeEntities(text)
  top.children.push(child)
}

export function parseMarkup(input: string, options: MarkupOptions = {}): MarkupNode {
  const source = input.charCodeAt(0) === BOM ? input.slice(1) : input
  const lowerCase = options.lowerCase === true
  const root = node('#root')
  const stack: MarkupNode[] = [root]
  const n = source.length
  let i = 0

  while (i < n) {
    const lt = source.indexOf('<', i)
    const end = lt === -1 ? n : lt
    if (end > i) addText(stack[stack.length - 1], source.slice(i, end), false)
    if (lt === -1) break
    i = lt

    if (source.startsWith('<!--', i)) {
      const close = source.indexOf('-->', i + 4)
      i = close === -1 ? n : close + 3
      continue
    }
    if (source.startsWith('<![CDATA[', i)) {
      const close = source.indexOf(']]>', i + 9)
      addText(stack[stack.length - 1], source.slice(i + 9, close === -1 ? n : close), true)
      i = close === -1 ? n : close + 3
      continue
    }
    if (source.charAt(i + 1) === '!' || source.charAt(i + 1) === '?') {
      const close = source.indexOf('>', i)
      i = close === -1 ? n : close + 1
      continue
    }

    OPEN_TAG.lastIndex = i
    const open = OPEN_TAG.exec(source)
    if (open) {
      const rawName = open[1]
      const name = lowerCase ? rawName.toLowerCase() : rawName
      const selfClosing = /\/\s*$/.test(open[2])
      i = OPEN_TAG.lastIndex
      while (stack.length > 1 && options.autoClose?.(stack[stack.length - 1].name, name)) stack.pop()
      const element = node(name, parseAttrs(open[2], lowerCase))
      stack[stack.length - 1].children.push(element)
      if (options.rawText?.has(name) && !selfClosing) {
        const closer = new RegExp(`</${rawName}\\s*>`, 'ig')
        closer.lastIndex = i
        const hit = closer.exec(source)
        const bodyEnd = hit ? hit.index : n
        element.text = source.slice(i, bodyEnd)
        i = hit ? closer.lastIndex : n
        continue
      }
      if (!selfClosing && !options.voidTags?.has(name)) stack.push(element)
      continue
    }

    CLOSE_TAG.lastIndex = i
    const close = CLOSE_TAG.exec(source)
    if (close) {
      const name = lowerCase ? close[1].toLowerCase() : close[1]
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k
          break
        }
      }
      i = CLOSE_TAG.lastIndex
      continue
    }

    addText(stack[stack.length - 1], '<', true)
    i += 1
  }
  return root
}

/** All text inside a node, in order, with surrounding whitespace trimmed. */
export function textOf(element: MarkupNode | undefined): string {
  if (!element) return ''
  if (element.name === '#text') return element.text
  let out = element.text
  for (const child of element.children) out += textOf(child)
  return out.trim()
}

/** First direct child with this name, or undefined. */
export function childNamed(element: MarkupNode, name: string): MarkupNode | undefined {
  return element.children.find((child) => child.name === name)
}

/** Every direct child with this name. */
export function childrenNamed(element: MarkupNode, name: string): MarkupNode[] {
  return element.children.filter((child) => child.name === name)
}

/** Depth-first search for the first element with this name. */
export function findFirst(element: MarkupNode, name: string): MarkupNode | undefined {
  for (const child of element.children) {
    if (child.name === name) return child
    const hit = findFirst(child, name)
    if (hit) return hit
  }
  return undefined
}
