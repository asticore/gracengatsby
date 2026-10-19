import { sanitizeCustomCss } from '@/lib/blockStyle'

import { isDeniedNodeType } from './manifest'

/**
 * Cleans a template tree before it is inserted into a page. By default raw
 * HTML and script-like content is removed but the node is KEPT (so the layout
 * and the list of what was in the template are unchanged):
 *  - elements of a denied type (html, code, embed, ...) lose their content props
 *  - keys that run code (on* handlers, srcdoc, scripts, dangerouslySetInnerHTML) are dropped
 *  - string values holding script or frame tags, javascript: links and the like are emptied
 *  - design.customCss goes through the same sanitiser the renderer uses
 * With `allowRawHtml` (a flagged template AND the admin ticking the opt-in) element
 * content is left alone; code-running keys and script text are still removed.
 */

export type SanitizeOptions = { allowRawHtml?: boolean }

const DROP_KEY = /^(on[a-z]+|srcdoc|script|scripts|headscripts|bodyscripts|customjs|customscript|dangerouslysetinnerhtml|__proto__|constructor|prototype)$/i
const DANGEROUS_TEXT = /<\s*(script|iframe|object|embed)\b|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i
const CONTENT_KEYS = new Set(['html', 'code', 'css', 'js', 'script', 'embed', 'content', 'src', 'srcdoc', 'text', 'value'])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function clean(value: unknown, depth: number): unknown {
  if (depth > 60) return null
  if (typeof value === 'string') return DANGEROUS_TEXT.test(value) ? '' : value
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1))
  if (isObj(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (DROP_KEY.test(key)) continue
      out[key] = clean(item, depth + 1)
    }
    return out
  }
  return value
}

function cleanNode(node: unknown, options: SanitizeOptions): unknown {
  if (!isObj(node)) return node
  const out = clean(node, 0) as Record<string, unknown>

  const elementType = typeof node.elementType === 'string' ? node.elementType : ''
  const blockType = typeof node.blockType === 'string' ? node.blockType : ''
  const denied = (elementType && isDeniedNodeType(elementType)) || (blockType && isDeniedNodeType(blockType))
  if (denied && !options.allowRawHtml) {
    if (isObj(out.props)) {
      const props: Record<string, unknown> = { ...out.props }
      for (const key of Object.keys(props)) if (CONTENT_KEYS.has(key.toLowerCase())) props[key] = ''
      out.props = props
    }
    for (const key of Object.keys(out)) if (CONTENT_KEYS.has(key.toLowerCase())) out[key] = ''
  }

  if (isObj(out.design) && typeof out.design.customCss === 'string') {
    const css = sanitizeCustomCss(out.design.customCss)
    const design: Record<string, unknown> = { ...out.design }
    if (css) design.customCss = css
    else delete design.customCss
    out.design = design
  }

  if (Array.isArray(out.columns)) {
    out.columns = out.columns.map((column) =>
      isObj(column) && Array.isArray(column.blocks) ? { ...column, blocks: column.blocks.map((child) => cleanNode(child, options)) } : column,
    )
  }
  return out
}

/** A cleaned copy of the tree. Never drops a node. */
export function sanitizeTemplateTree<T>(tree: readonly T[], options: SanitizeOptions = {}): T[] {
  return tree.map((node) => cleanNode(node, options) as T)
}
