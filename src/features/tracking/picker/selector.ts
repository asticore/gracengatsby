/*
 * Robust CSS selector for a clicked element, for the visual event picker. Tries the most stable hooks first (an id, a
 * data attribute, stable classes) and falls back to a structural path. Each candidate is checked against the page: it
 * must match exactly the clicked element, and the match count is reported so the admin can see how unique it is.
 */

export type SelectorCandidate = { selector: string; kind: 'id' | 'data' | 'class' | 'path'; matches: number }

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/
/** Hashed or generated class names change between builds: skip them. */
const GENERATED = /(^css-|^sc-|^_|^js-|[0-9a-f]{6,}|__[a-z0-9]{4,}|--[a-z0-9]{5,})/i
const DATA_ATTRS = ['data-eg-block', 'data-eg-event', 'data-testid', 'data-track', 'data-id', 'name']

/** Escapes one identifier for use in a CSS selector. */
export function escapeIdent(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`)
}

const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Counts the matches of a selector in the root. Returns 0 for an invalid selector. */
function countMatches(root: ParentNode, selector: string, target: Element): number {
  try {
    const found = root.querySelectorAll(selector)
    return Array.from(found).includes(target) ? found.length : 0
  } catch {
    return 0
  }
}

/** Candidates ordered most stable first. Only those that match the element are returned. */
export function selectorCandidates(el: Element, root: ParentNode = el.ownerDocument): SelectorCandidate[] {
  const tag = el.tagName.toLowerCase()
  const out: SelectorCandidate[] = []
  const add = (selector: string, kind: SelectorCandidate['kind']) => {
    const matches = countMatches(root, selector, el)
    if (matches > 0) out.push({ selector, kind, matches })
  }

  if (el.id && IDENT.test(el.id)) add(`#${escapeIdent(el.id)}`, 'id')

  for (const attr of DATA_ATTRS) {
    const value = el.getAttribute(attr)
    if (value) add(`${tag}[${attr}=${quote(value)}]`, 'data')
  }

  const classes = Array.from(el.classList).filter((c) => IDENT.test(c) && !GENERATED.test(c))
  if (classes.length) {
    add(`${tag}.${classes.slice(0, 2).map(escapeIdent).join('.')}`, 'class')
    if (classes.length > 2) add(classes.slice(0, 3).map((c) => `.${escapeIdent(c)}`).join(''), 'class')
  }

  // Structural path, from the element up to an id or the root, one nth-child per level.
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.tagName.toLowerCase() !== 'html') {
    const parent: Element | null = node.parentElement
    const index = parent ? Array.from(parent.children).indexOf(node) + 1 : 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    const path = parts.join(' > ')
    if (countMatches(root, path, el) === 1) {
      out.push({ selector: path, kind: 'path', matches: 1 })
      break
    }
    if (node.id && IDENT.test(node.id)) {
      parts[0] = `#${escapeIdent(node.id)}`
      const anchored = parts.join(' > ')
      if (countMatches(root, anchored, el) === 1) {
        out.push({ selector: anchored, kind: 'path', matches: 1 })
      }
      break
    }
    node = parent
  }
  return out
}

/** The best candidate that is unique on the page, or the best one with a count that the admin must check. */
export function bestSelector(el: Element, root: ParentNode = el.ownerDocument): SelectorCandidate | null {
  const all = selectorCandidates(el, root)
  return all.find((c) => c.matches === 1) ?? all[0] ?? null
}
