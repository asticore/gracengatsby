/**
 * Display conditions ("Visibility rules") for a block - pure helpers shared by the sanitiser
 * (blockStyle.ts), the renderer (StyledBlock) and the client evaluator (VisibilityGate).
 *
 * Published pages are edge cached and identical for every visitor, so nothing here is decided on
 * the server: the block carries its rules in data-eg-cond and a small client script reveals it.
 */

export type VisAuth = 'in' | 'out'

/** The compact rule set that travels in the data-eg-cond attribute. */
export type VisRules = {
  /** Show from this ISO date / datetime. */
  f?: string
  /** Show until this ISO date / datetime (a bare date includes the whole day, UTC). */
  u?: string
  /** Logged in or logged out. */
  a?: VisAuth
  /** Any of these role slugs (implies logged in). */
  r?: string[]
  /** The path + query must contain this text (case-insensitive). */
  q?: string
}

export type VisContext = {
  /** Epoch milliseconds. */
  now: number
  /** null = not known (the state request failed): auth and role rules then fail closed. */
  loggedIn: boolean | null
  roles: readonly string[]
  /** pathname + search of the page. */
  href: string
}

export const VIS_MAX_ROLES = 10
export const VIS_MAX_URL = 120
const ROLE_SLUG = /^[a-z0-9][a-z0-9_-]{0,31}$/
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/

/** True for YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS][Z|+HH:MM] naming a real calendar moment. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 32) return false
  const m = ISO.exec(v)
  if (!m) return false
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => (x === undefined ? 0 : Number(x)))
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return false
  return h <= 23 && mi <= 59 && s <= 59 && Number.isFinite(Date.parse(toParsable(v)))
}

const toParsable = (v: string): string => {
  const t = v.replace(' ', 'T')
  // A date-time with no zone reads as UTC so every visitor sees the same moment.
  return /T/.test(t) && !/(Z|[+-]\d{2}:\d{2})$/.test(t) ? `${t}Z` : t
}

/** Epoch ms of a validated ISO string; `endOfDay` makes a bare date mean its last millisecond. */
export function isoToMs(v: string, endOfDay = false): number {
  const bare = !/[T ]/.test(v)
  const ms = Date.parse(bare ? `${v}T00:00:00Z` : toParsable(v))
  return bare && endOfDay ? ms + 86400000 - 1 : ms
}

/** Cleans a comma list of role slugs: lower case, slug-shaped, unique, at most VIS_MAX_ROLES. */
export function cleanRoles(v: unknown): string[] {
  if (typeof v !== 'string') return []
  const out: string[] = []
  for (const part of v.split(',')) {
    const t = part.trim().toLowerCase()
    if (ROLE_SLUG.test(t) && !out.includes(t)) out.push(t)
    if (out.length >= VIS_MAX_ROLES) break
  }
  return out
}

/** Path / query text: no control characters, quotes, angle brackets or backslashes. */
export function cleanUrlText(v: unknown): string {
  if (typeof v !== 'string') return ''
  let out = ''
  for (const ch of v.trim()) {
    const c = ch.charCodeAt(0)
    if (c < 32 || c === 127 || ch === '"' || ch === "'" || ch === '<' || ch === '>' || c === 92) continue
    out += ch
    if (out.length >= VIS_MAX_URL) break
  }
  return out
}

type VisKeys = {
  showFrom?: unknown
  showUntil?: unknown
  showAuth?: unknown
  showRoles?: unknown
  showUrl?: unknown
}

/** Builds the compact rule set from (already sanitised) style keys; null when no rule is set. */
export function rulesFromStyle(style: VisKeys): VisRules | null {
  const r: VisRules = {}
  if (isIsoDate(style.showFrom)) r.f = style.showFrom
  if (isIsoDate(style.showUntil)) r.u = style.showUntil
  if (style.showAuth === 'in' || style.showAuth === 'out') r.a = style.showAuth
  const roles = cleanRoles(style.showRoles)
  if (roles.length > 0) r.r = roles
  const q = cleanUrlText(style.showUrl)
  if (q) r.q = q
  return Object.keys(r).length > 0 ? r : null
}

/** True when the rules need the visitor (login, role, URL): those start hidden until the script decides. */
export const needsClientGate = (r: VisRules): boolean => Boolean(r.a || (r.r && r.r.length > 0) || r.q)

/** True when the rules need to know who is signed in. */
export const needsAuthState = (r: VisRules): boolean => Boolean(r.a || (r.r && r.r.length > 0))

/** Parses a data-eg-cond value back into rules; null for anything malformed. */
export function parseRules(json: string | null | undefined): VisRules | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const r: VisRules = {}
    if (isIsoDate(raw.f)) r.f = raw.f
    if (isIsoDate(raw.u)) r.u = raw.u
    if (raw.a === 'in' || raw.a === 'out') r.a = raw.a
    if (Array.isArray(raw.r)) {
      const roles = cleanRoles(raw.r.filter((x) => typeof x === 'string').join(','))
      if (roles.length > 0) r.r = roles
    }
    const q = cleanUrlText(raw.q)
    if (q) r.q = q
    return Object.keys(r).length > 0 ? r : null
  } catch {
    return null
  }
}

/** The one decision: every rule that is set must pass. */
export function evaluateRules(rules: VisRules, ctx: VisContext): boolean {
  if (rules.f && ctx.now < isoToMs(rules.f)) return false
  if (rules.u && ctx.now > isoToMs(rules.u, true)) return false
  if (rules.a === 'in' && ctx.loggedIn !== true) return false
  if (rules.a === 'out' && ctx.loggedIn !== false) return false
  if (rules.r && rules.r.length > 0) {
    if (ctx.loggedIn !== true) return false
    const have = ctx.roles.map((x) => x.toLowerCase())
    if (!rules.r.some((x) => have.includes(x))) return false
  }
  if (rules.q && !ctx.href.toLowerCase().includes(rules.q.toLowerCase())) return false
  return true
}
