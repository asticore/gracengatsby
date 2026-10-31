import { safeUrl } from './sanitize'

/**
 * Custom CSS written by a user, made safe to place inside a page.
 *
 * - Input is cut to 8000 characters and stripped of comments, backslashes
 *   (CSS escapes can hide "javascript:") and "<" (so "</style>" cannot appear).
 * - @import, expression(), javascript:, behavior and -moz-binding are removed.
 * - url() is kept only for http(s) and site-relative URLs.
 * - Top-level rules get the element's scope selector in front. "html", "body"
 *   and ":root" map to the element itself. Only @media blocks are kept, one
 *   level deep; other at-rules (keyframes, font-face) are dropped because
 *   they would be global.
 * - Braces are removed from declarations, so the output always has balanced
 *   braces that this code wrote.
 */

const MAX_INPUT = 8000
const MAX_SELECTOR = 300

function cleanse(input: string): string {
  let css = input.slice(0, MAX_INPUT)
  css = css.replace(/\/\*[\s\S]*?(\*\/|$)/g, '')
  // Braces inside quoted strings (attribute values, content) are not rule boundaries, so drop them first.
  css = css.replace(/"[^"]*"|'[^']*'/g, (quoted) => quoted.replace(/[{}]/g, ''))
  css = css.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\\<]/g, '')
  css = css.replace(/@import[^;]*;?/gi, '')
  css = css.replace(/expression\s*\(/gi, '')
  css = css.replace(/(javascript|vbscript)\s*:/gi, '')
  css = css.replace(/behavior\s*:/gi, '')
  css = css.replace(/-moz-binding/gi, '')
  css = css.replace(/url\(\s*([^)]*)\)/gi, (_match, arg: string) => {
    const url = safeUrl(arg.trim().replace(/^['"]|['"]$/g, ''))
    return url ? `url("${url}")` : ''
  })
  return css
}

/** Prefixes one comma-separated selector with the scope. Returns '' when the selector cannot be scoped. */
function scopeSelector(selector: string, scope: string): string {
  const s = selector.trim()
  if (s.length === 0 || s.length > MAX_SELECTOR || /[@{}]/.test(s)) return ''
  if (/^(:root|html|body)$/i.test(s)) return scope
  return `${scope} ${s}`
}

/** Walks the cleaned CSS once, rule by rule. `depth` 0 is the top level, 1 is inside @media. */
function scopeRules(css: string, scope: string, depth: number): string {
  let out = ''
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).trim()
    let level = 1
    let j = open + 1
    while (j < css.length && level > 0) {
      if (css[j] === '{') level++
      else if (css[j] === '}') level--
      j++
    }
    const body = css.slice(open + 1, level === 0 ? j - 1 : j)
    i = j
    const lower = prelude.toLowerCase()
    if (lower.startsWith('@media')) {
      if (depth === 0) {
        const inner = scopeRules(body, scope, 1)
        if (inner) out += `@media${prelude.slice(6)}{${inner}}`
      }
      continue
    }
    if (prelude.startsWith('@')) continue
    const declarations = body.replace(/[{}]/g, '').trim()
    const selectors = prelude
      .split(',')
      .map((part) => scopeSelector(part, scope))
      .filter(Boolean)
    if (selectors.length > 0 && declarations.length > 0) out += `${selectors.join(',')}{${declarations}}`
  }
  return out
}

/** Returns scoped, sanitised CSS for one element. Returns '' when there is nothing usable. */
export function scopeCustomCss(input: unknown, scope: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) return ''
  return scopeRules(cleanse(input), scope, 0)
}
