/**
 * Removes secrets and personal details from an error before it is stored in
 * the error log. Pure: no engine, no network, so the rules can be tested alone.
 *
 * What is removed: query strings (they often carry tokens), e-mail addresses,
 * "Bearer" credentials, `password=`/`token=`-style pairs, and long random-looking
 * strings such as keys and hashes. Anything removed is replaced with a short
 * marker so the reader can see that something was there.
 */

export const REDACTED = '[redacted]'
export const EMAIL_MARKER = '[email]'

const URL_QUERY = /(https?:\/\/[^\s"'<>()]*?)\?[^\s"'<>()]*/gi
const PATH_QUERY = /^([^?#]*)[?#].*$/
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const SECRET_PAIR = /\b(password|passwd|secret|token|api[_-]?key|apikey|authorization|cookie)(["']?\s*[:=]\s*["']?)(?!Bearer \[redacted\])[^\s"',;&]+/gi
const HEX_RUN = /\b[0-9a-f]{32,}\b/gi
const LONG_TOKEN = /\b[A-Za-z0-9_\-+/=]{32,}\b/g

/** Turns a long token into the marker only when it mixes letters and digits, so long words are left alone. */
function redactLongToken(token: string): string {
  return /\d/.test(token) && /[A-Za-z]/.test(token) ? REDACTED : token
}

/** Removes the query string from a bare path such as /shop?utm=1, keeping the path. */
export function stripQuery(path: string | null | undefined): string {
  if (!path) return ''
  return String(path).replace(PATH_QUERY, '$1')
}

/**
 * Scrubs free text (a message, a stack trace, a body). Safe to call on any
 * string. Does not cut the length; combine with clipText for that.
 */
export function scrubText(value: string | null | undefined): string {
  if (!value) return ''
  return String(value)
    .replace(URL_QUERY, '$1')
    .replace(EMAIL, EMAIL_MARKER)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(SECRET_PAIR, `$1$2${REDACTED}`)
    .replace(HEX_RUN, REDACTED)
    .replace(LONG_TOKEN, redactLongToken)
}

/** Cuts text to a maximum length, ending with "..." when it had to be shortened. */
export function clipText(value: string, max: number): string {
  if (value.length <= max) return value
  if (max <= 3) return value.slice(0, Math.max(0, max))
  return `${value.slice(0, max - 3)}...`
}

/** Scrubs then cuts. The usual call for anything stored. */
export function cleanForStorage(value: string | null | undefined, max: number): string {
  return clipText(scrubText(value), max)
}
