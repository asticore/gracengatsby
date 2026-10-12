/**
 * Which websites may embed a form or post to it.
 *
 * The decision is per form: `formConfig.embed.allowedOrigins`. An empty list
 * means "any website" - the default, because an embed that silently refuses
 * the first site you try is worse than one that works - and the admin screen
 * shows a warning while it stays that way.
 *
 * What this protects, and what it does not. The submit endpoint carries no
 * cookies and acts for nobody: it creates an entry with the answers it was
 * sent, after the spam checks. So there is no ambient authority for a
 * cross-site request to borrow (the classic CSRF problem does not exist
 * here), and the allow-list is about stopping other sites from *using* your
 * form, not about authenticating the visitor. It is enforced on the POST
 * itself, not only on the preflight, because a form can be posted with a
 * "simple" content type that the browser sends without asking first.
 *
 * Requests with no Origin header (curl, a server) are let through: Origin is a
 * browser header, the allow-list is a browser control, and every other
 * defence (rate limit, honeypot, time trap, captcha) still applies to them.
 */

import { cleanOrigin } from './config'

export type OriginDecision = {
  allowed: boolean
  /** True when the list is empty so any site is accepted. Drives the warning in the editor. */
  open: boolean
  /** The origin to echo in Access-Control-Allow-Origin, when there is one. */
  origin: string | null
}

const hostMatches = (pattern: string, origin: string): boolean => {
  if (pattern === origin) return true
  const wildcard = /^(https?):\/\/\*\.(.+?)(?::(\d+))?$/.exec(pattern)
  if (!wildcard) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (`${url.protocol}`.replace(':', '') !== wildcard[1]) return false
  if ((wildcard[3] || '') !== url.port) return false
  // `*.example.com` matches a.example.com and a.b.example.com, never example.com itself.
  return url.hostname.endsWith(`.${wildcard[2]}`)
}

/** `selfOrigin` is this site's own origin, always allowed so the form works on its own pages. */
export function checkOrigin(originHeader: string | null | undefined, allowedOrigins: string[], selfOrigin?: string): OriginDecision {
  const list = (allowedOrigins || []).map(cleanOrigin).filter((entry): entry is string => Boolean(entry))
  const open = list.length === 0
  const origin = originHeader ? cleanOrigin(originHeader) : null

  // "null" (a sandboxed iframe or a file:// page) or a malformed header is not a usable origin.
  if (originHeader && !origin) return { allowed: false, open, origin: null }

  if (!origin) return { allowed: true, open, origin: null }
  if (selfOrigin && origin === cleanOrigin(selfOrigin)) return { allowed: true, open, origin }
  if (open) return { allowed: true, open, origin }
  return { allowed: list.some((pattern) => hostMatches(pattern, origin)), open, origin }
}

/** CORS headers for an allowed origin. Never `*`, never credentials. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (!origin) return headers
  headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  headers['Access-Control-Allow-Headers'] = 'Content-Type'
  headers['Access-Control-Max-Age'] = '600'
  return headers
}

/**
 * The value for `Content-Security-Policy: frame-ancestors`, which decides who
 * may put the embed page in an iframe. `'self'` is always included.
 */
export function frameAncestors(allowedOrigins: string[]): string {
  const list = (allowedOrigins || []).map(cleanOrigin).filter((entry): entry is string => Boolean(entry))
  if (list.length === 0) return '*'
  return ["'self'", ...list].join(' ')
}

/**
 * Guard for the state-changing admin routes of this feature: the body must be
 * JSON (a cross-site HTML form cannot send that without a preflight) and, when
 * the browser names an Origin, it must be this site. Returns a refusal reason,
 * or null when the request is fine.
 */
export function adminRequestRefusal(request: Request): string | null {
  const type = (request.headers.get('content-type') || '').toLowerCase()
  if (!type.startsWith('application/json')) return 'Send a JSON body.'
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return 'Cross-site requests are not allowed.'
  return null
}
