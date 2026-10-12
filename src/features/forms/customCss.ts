/**
 * Per-form custom CSS, made safe to drop into a page.
 *
 * An author may write any CSS for one form. Two things must hold when it is
 * rendered: it only touches that form (every selector is prefixed with the
 * form's scope class), and it cannot break out of its <style> element or pull
 * in other documents. This is a small brace-aware scoper, not a full CSS
 * parser: it understands rules, @media / @supports blocks (scoped inside),
 * @keyframes and @font-face (kept as written), and removes @import and
 * anything else it does not recognise.
 */

const MAX_LENGTH = 20_000

/** Removes comments and sequences that could end the style element or run old-IE script. */
function strip(css: string): string {
  return css
    .slice(0, MAX_LENGTH)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[<\\]/g, '')
    .replace(/-->/g, '')
    .replace(/url\(\s*(['"]?)([^)]*?)\1\s*\)/gi, (match, _q: string, target: string) => {
      const t = target.trim()
      const ok = /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(t) || (t.startsWith('/') && !t.startsWith('//'))
      return ok ? match : 'none'
    })
    .replace(/url\s*\(/gi, (m, offset: number, all: string) => (/url\(\s*(['"]?)(data:image\/|\/(?!\/))/i.test(all.slice(offset, offset + 40)) ? m : '('))
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript\s*:/gi, '')
    .replace(/behaviou?r\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(new RegExp('[\\u2028\\u2029]', 'g'), ' ')
}

/** Splits at top-level commas (not inside parentheses or brackets). */
function splitSelectors(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function scopeSelector(selector: string, scope: string): string {
  // The page-level selectors an author reaches for mean "the form" here.
  const rewritten = selector.replace(/^(?::root|html|body)\b/, '').trim()
  if (!rewritten) return scope
  if (rewritten.startsWith('&')) return `${scope}${rewritten.slice(1)}`
  return `${scope} ${rewritten}`
}

type Chunk = { prelude: string; body: string | null }

/** Reads top-level `prelude { body }` chunks (body null for a trailing statement). */
function chunks(css: string): Chunk[] {
  const out: Chunk[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    const semi = css.indexOf(';', i)
    if (open === -1) break
    // A statement such as `@import url(...);` comes before the next block.
    if (semi !== -1 && semi < open && css.slice(i, semi).trim().startsWith('@')) {
      out.push({ prelude: css.slice(i, semi).trim(), body: null })
      i = semi + 1
      continue
    }
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1
      else if (css[j] === '}') depth -= 1
      j += 1
    }
    out.push({ prelude: css.slice(i, open).trim(), body: css.slice(open + 1, depth === 0 ? j - 1 : j) })
    i = j
  }
  return out
}

function scopeBlock(css: string, scope: string): string {
  const parts: string[] = []
  for (const { prelude, body } of chunks(css)) {
    if (body === null || !prelude) continue
    if (prelude.startsWith('@')) {
      const name = /^@([a-z-]+)/i.exec(prelude)?.[1]?.toLowerCase()
      if (name === 'media' || name === 'supports' || name === 'container') {
        parts.push(`${prelude}{${scopeBlock(body, scope)}}`)
      } else if (name === 'keyframes' || name === '-webkit-keyframes') {
        parts.push(`${prelude}{${body}}`)
      }
      continue
    }
    const selectors = splitSelectors(prelude).map((selector) => scopeSelector(selector, scope))
    parts.push(`${selectors.join(',')}{${body.trim()}}`)
  }
  return parts.join('\n')
}

/** The class the renderer puts on the form wrapper. */
export const scopeClass = (formId: string | number): string => `eg-form-${String(formId).replace(/[^a-zA-Z0-9_-]/g, '')}`

export function scopeCustomCss(css: string | undefined | null, formId: string | number): string {
  if (!css || !css.trim()) return ''
  const cleaned = strip(css)
  return scopeBlock(cleaned, `.${scopeClass(formId)}`)
}
