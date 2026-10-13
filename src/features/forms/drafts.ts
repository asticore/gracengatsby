import type { FormFieldDef, SubmissionValues } from './types'

/**
 * Save and continue: the pure rules, with no database or request in sight.
 *
 * A visitor who saves half a form is emailed a link that carries a secret token. The token is
 * random, 32 hex characters, and only the link ever holds it: the database keeps a SHA-256 hash,
 * so a copy of the table cannot be used to resume anyone's form. A draft lives 30 days.
 *
 * What is saved is what the visitor typed, and nothing else. Anything that is not a plain answer
 * is dropped by name: file uploads, signatures, payment, password-like fields, calculated totals
 * (recomputed on resume anyway) and layout-only blocks. Field names that the form does not define
 * are dropped too, so a crafted request cannot write arbitrary keys. Sizes are capped.
 *
 * Client and server both import this module, so it must stay free of server-only code.
 */

export const DRAFT_TTL_DAYS = 30
export const DRAFT_TTL_MS = DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000

/** The query-string key on a page that carries the secret: ?resume=<token>. */
export const RESUME_PARAM = 'resume'
/** The body field the browser sends with the final submission when it was resumed, so the draft can be removed. */
export const RESUME_FIELD = 'eg_resume'

export const MAX_DRAFT_TEXT = 5000
export const MAX_DRAFT_ITEMS = 200
export const MAX_DRAFT_KEYS = 50
export const MAX_DRAFT_DEPTH = 3
export const MAX_DRAFT_JSON_CHARS = 60_000
export const MAX_DRAFT_PAGE = 99

/** Field types whose answer is never kept in a draft. */
export const NEVER_SAVED_TYPES = ['file', 'signature', 'payment', 'password', 'calculation', 'html', 'section', 'page']

const TOKEN_PATTERN = /^[0-9a-f]{32}$/
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** A new secret: 16 random bytes, written as 32 lower-case hex characters. */
export function newDraftToken(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  return toHex(random(new Uint8Array(16)))
}

export const isDraftToken = (value: unknown): value is string => typeof value === 'string' && TOKEN_PATTERN.test(value)

/** SHA-256 of the token, hex. This is the only form of the secret that is ever stored. */
export async function hashDraftToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return toHex(new Uint8Array(digest))
}

export const draftExpiry = (now: Date): string => new Date(now.getTime() + DRAFT_TTL_MS).toISOString()

/** True when the time is missing, unreadable, or not after `now`. */
export function isDraftExpired(expiresAt: unknown, now: Date): boolean {
  const time = Date.parse(typeof expiresAt === 'string' ? expiresAt : '')
  return !Number.isFinite(time) || time <= now.getTime()
}

/** Trimmed, lower-case, and plausibly an address. The draft is only ever sent to this address. */
export function cleanDraftEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

/** A step number the visitor could have been on, or 0. */
export function cleanDraftPage(value: unknown): number {
  const page = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(page) || page < 0) return 0
  return Math.min(page, MAX_DRAFT_PAGE)
}

/** Keeps plain strings, numbers, booleans, arrays and objects, within the size limits. Anything else is dropped. */
function cleanDraftValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.slice(0, MAX_DRAFT_TEXT)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (depth >= MAX_DRAFT_DEPTH) return undefined
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DRAFT_ITEMS)
      .map((entry) => cleanDraftValue(entry, depth + 1))
      .filter((entry) => entry !== undefined)
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, MAX_DRAFT_KEYS)) {
      if (key.length > 100) continue
      const cleaned = cleanDraftValue(entry, depth + 1)
      if (cleaned !== undefined) out[key] = cleaned
    }
    return out
  }
  return undefined
}

/**
 * The answers that may be saved for this form: only names the form defines, only types that are plain answers,
 * and only values that fit the limits. Never throws; anything unusable is simply not kept.
 */
export function sanitiseDraftValues(fields: FormFieldDef[], values: unknown): SubmissionValues {
  const out: SubmissionValues = {}
  if (!values || typeof values !== 'object' || Array.isArray(values)) return out
  const allowed = new Map<string, FormFieldDef>()
  for (const field of fields || []) {
    if (!field?.name || NEVER_SAVED_TYPES.includes(field.type || '')) continue
    allowed.set(field.name, field)
  }
  for (const [name, raw] of Object.entries(values as Record<string, unknown>)) {
    if (!allowed.has(name)) continue
    const cleaned = cleanDraftValue(raw, 0)
    if (cleaned !== undefined) out[name] = cleaned as SubmissionValues[string]
  }
  return out
}

/** The stored form of the answers, or null when they are too large to keep. */
export function serialiseDraftValues(values: SubmissionValues): string | null {
  const json = JSON.stringify(values)
  return json.length <= MAX_DRAFT_JSON_CHARS ? json : null
}

/** The answers back out of storage. A damaged or non-object value reads as nothing saved. */
export function parseDraftValues(json: unknown): SubmissionValues {
  if (typeof json !== 'string') return {}
  try {
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SubmissionValues) : {}
  } catch {
    return {}
  }
}

/**
 * The address to send the visitor back to: the page they were on, with ?resume=<token> set.
 * Only a page on this site is used, so an emailed link can never point somewhere else. Otherwise the
 * form's own embed page on this site is used, which resumes the same way.
 */
export function resumeLink(options: { pageUrl?: unknown; selfOrigin: string; formAddress: string; token: string }): string {
  let base = `${options.selfOrigin}${options.formAddress}`
  if (typeof options.pageUrl === 'string' && options.pageUrl.length <= 2000) {
    try {
      const page = new URL(options.pageUrl)
      if ((page.protocol === 'https:' || page.protocol === 'http:') && page.origin === options.selfOrigin) base = page.href
    } catch {
      // Not a URL: keep the fallback.
    }
  }
  const link = new URL(base)
  link.searchParams.set(RESUME_PARAM, options.token)
  return link.href
}

/** The token from the address bar, when the page was opened from a resume link. */
export function readResumeToken(search: string): string | null {
  try {
    const token = new URLSearchParams(search).get(RESUME_PARAM)
    return isDraftToken(token) ? token : null
  } catch {
    return null
  }
}
