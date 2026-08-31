import { AB_COOKIE, AB_COOKIE_MAX_AGE } from './slugs'
import { newVisitorId } from './assign'
import type { VisitorState } from './types'

/**
 * The visitor cookie: read, verify, write.
 *
 * Signed rather than encrypted. Nothing in it is secret - it says which arm of
 * which test somebody is in - but it must not be editable, or a visitor could
 * move themselves between arms and skew a result, or replay somebody else's
 * conversion dedupe set. An HMAC over the body is enough for that and costs
 * one WebCrypto call, which is the whole reason assignment needs no database.
 *
 * HttpOnly on purpose. The browser-side tracker never needs to read the
 * assignment: it posts the goal it saw and the server reads the cookie off the
 * request, which also stops a page script from forging a conversion for an arm
 * the visitor was never in.
 */

const encoder = new TextEncoder()

const b64url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const unb64url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const keyCache = new Map<string, Promise<CryptoKey>>()

const signingKey = (secret: string): Promise<CryptoKey> => {
  // Importing the key is not free and the secret never changes within a
  // deployment, so it is imported once per isolate rather than per request.
  const cached = keyCache.get(secret)
  if (cached) return cached
  const key = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  keyCache.set(secret, key)
  return key
}

const sign = async (body: string, secret: string): Promise<string> => {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(body))
  return b64url(new Uint8Array(signature))
}

/** Length-independent compare, so a mismatch does not leak where it diverged. */
const equals = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

/**
 * Caps on how much the cookie may carry.
 *
 * A site that has run fifty tests over two years would otherwise send a
 * multi-kilobyte cookie on every request forever. Oldest entries are dropped
 * first; the worst case for a dropped assignment is that a long-dormant test
 * re-buckets one visitor, and because bucketing is a pure hash of the same
 * visitor id they land back in the same arm anyway.
 */
const MAX_ASSIGNMENTS = 30
const MAX_CONVERSIONS = 60

const trim = <T>(record: Record<string, T>, max: number): Record<string, T> => {
  const entries = Object.entries(record)
  if (entries.length <= max) return record
  return Object.fromEntries(entries.slice(entries.length - max))
}

export const emptyVisitor = (): VisitorState => ({ v: 1, id: newVisitorId(), a: {}, c: {} })

export const encodeVisitor = async (state: VisitorState, secret: string): Promise<string> => {
  const compact: VisitorState = {
    v: 1,
    id: state.id,
    a: trim(state.a, MAX_ASSIGNMENTS),
    c: trim(state.c, MAX_CONVERSIONS),
  }
  const body = b64url(encoder.encode(JSON.stringify(compact)))
  return `${body}.${await sign(body, secret)}`
}

/** Null for anything that is missing, malformed, or not signed by us. */
export const decodeVisitor = async (raw: string | null, secret: string): Promise<VisitorState | null> => {
  if (!raw) return null
  const split = raw.lastIndexOf('.')
  if (split <= 0) return null

  const body = raw.slice(0, split)
  if (!equals(raw.slice(split + 1), await sign(body, secret))) return null

  try {
    const parsed = JSON.parse(new TextDecoder().decode(unb64url(body))) as Partial<VisitorState>
    if (parsed?.v !== 1 || typeof parsed.id !== 'string' || !parsed.id) return null
    return {
      v: 1,
      id: parsed.id,
      a: parsed.a && typeof parsed.a === 'object' ? (parsed.a as Record<string, string>) : {},
      c: parsed.c && typeof parsed.c === 'object' ? (parsed.c as Record<string, 1>) : {},
    }
  } catch {
    return null
  }
}

/** Reads one cookie out of a raw Cookie header. */
export const readCookie = (header: string | null, name: string): string | null => {
  if (!header) return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) return decodeURIComponent(trimmed.slice(name.length + 1))
  }
  return null
}

export const readVisitorCookie = (header: string | null): string | null => readCookie(header, AB_COOKIE)

/** The Set-Cookie value. `secure` is left off on http so local development still works. */
export const visitorCookieHeader = async (
  state: VisitorState,
  secret: string,
  secure: boolean,
): Promise<string> => {
  const value = encodeURIComponent(await encodeVisitor(state, secret))
  return [
    `${AB_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${AB_COOKIE_MAX_AGE}`,
    'SameSite=Lax',
    'HttpOnly',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}
