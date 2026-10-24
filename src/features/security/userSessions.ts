/**
 * Signed-in sessions, per person, that can be listed and ended one by one.
 *
 * WHAT THIS ADDS AND WHAT IT DOES NOT TOUCH
 *
 * The engine already keeps a `sessions` array on the user row and checks the
 * token's `sid` claim against it. That cannot say which device is which and
 * cannot be shown to a person, so each new sign-in also writes a row in
 * `eg_user_sessions` and the token carries that row's id in a separate `usid`
 * claim. The old array and the old `sid` check are left exactly as they were.
 *
 * Nothing here may lock anyone out, so:
 *   - A token WITHOUT a `usid` claim (issued before this shipped) is never
 *     checked against this table. It stays valid until it expires on its own.
 *   - A token WITH one is refused only when the row is positively known to be
 *     revoked, expired, missing or someone else's. If the lookup itself throws
 *     (a database hiccup), the request is let through and a warning is logged.
 *   - Writing the row at sign-in is best effort. If it fails, the token is
 *     issued without a `usid` and behaves like a pre-existing one.
 *
 * This file is pure: the store is passed in, so the sign-in code can import it
 * without reaching a database, and tests can use an in-memory store.
 */

import { createHash, randomBytes, randomUUID } from 'crypto'

export const USER_SESSIONS_TABLE = 'eg_user_sessions'

/** `last_seen_at` is written at most this often per session. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

export type UserSessionRow = {
  id: string
  userId: number
  /** SHA-256 of the random `jti` claim. The claim itself is never stored. */
  tokenHash: string
  deviceLabel: string | null
  /** Truncated on the way in: see `coarseIp`. */
  ip: string | null
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  revokedAt: string | null
}

export type UserSessionStore = {
  insert: (row: UserSessionRow) => Promise<void>
  findByID: (id: string) => Promise<UserSessionRow | null>
  /** Sessions that are neither revoked nor expired at `now`, newest sign-in first. */
  listActiveForUser: (userId: number, now: string) => Promise<UserSessionRow[]>
  touch: (id: string, lastSeenAt: string) => Promise<void>
  extend: (id: string, expiresAt: string) => Promise<void>
  /** Marks one session revoked, only if it belongs to `userId` and is not already. Returns whether a row changed. */
  revoke: (id: string, userId: number, at: string) => Promise<boolean>
  /** Marks every live session of `userId` revoked except `exceptId`. Returns how many changed. */
  revokeForUser: (userId: number, exceptId: string | null, at: string) => Promise<number>
}

export type SessionClient = {
  userAgent?: string | null
  ip?: string | null
  /** Re-authentication checks (password confirmations) sign in only to test a password; they must not leave a session behind. */
  skipSession?: boolean
}

export type SessionClaims = { usid: string; jti?: string; userId: number }

const warn = (msg: string, error?: unknown): void => {
  console.warn(JSON.stringify({ level: 'warn', msg, error: error === undefined ? undefined : String(error) }))
}

export const hashJti = (jti: string): string => createHash('sha256').update(jti).digest('hex')

// --- What a person sees -------------------------------------------------------

/** "Chrome on Windows", from a User-Agent string. Deliberately coarse. */
export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  const ua = typeof userAgent === 'string' ? userAgent : ''
  if (!ua) return 'Unknown device'

  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl\//i.test(ua)
              ? 'curl'
              : 'Browser'

  const system = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : ''

  return system ? `${browser} on ${system}` : browser
}

/**
 * Keeps enough of an address to tell two places apart and not enough to
 * locate a person: IPv4 loses its last octet, IPv6 keeps its first three
 * groups. Anything unrecognisable is dropped.
 */
export function coarseIp(ip: string | null | undefined): string | null {
  const value = typeof ip === 'string' ? ip.trim() : ''
  if (!value) return null

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(value)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`

  if (value.includes(':')) {
    const groups = value.split(':').filter((group, index, all) => group !== '' || index === 0 || index === all.length - 1)
    const head = groups.slice(0, 3).filter((group) => /^[0-9a-fA-F]{0,4}$/.test(group))
    return head.length > 0 ? `${head.join(':')}::` : null
  }
  return null
}

/** Reads the `usid` claim off a token WITHOUT verifying it. Only for "which of my sessions is this one" after the engine has already authenticated the request. */
export function sessionIdFromToken(token: string | null | undefined): string | null {
  try {
    const segment = typeof token === 'string' ? token.split('.')[1] : undefined
    if (!segment) return null
    const claims = JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { usid?: unknown }
    return typeof claims.usid === 'string' && claims.usid ? claims.usid : null
  } catch {
    return null
  }
}

// --- Writing a session --------------------------------------------------------

/**
 * Records a new sign-in. Returns the ids to put in the token, or null if the
 * row could not be written - in which case the token simply goes out without
 * them, like a token issued before this existed.
 */
export async function openSession(
  store: UserSessionStore,
  args: { userId: number; client?: SessionClient; now: number; ttlSeconds: number },
): Promise<{ usid: string; jti: string } | null> {
  const usid = randomUUID()
  const jti = randomBytes(16).toString('hex')
  const at = new Date(args.now).toISOString()
  try {
    await store.insert({
      id: usid,
      userId: args.userId,
      tokenHash: hashJti(jti),
      deviceLabel: deviceLabelFromUserAgent(args.client?.userAgent),
      ip: coarseIp(args.client?.ip),
      createdAt: at,
      lastSeenAt: at,
      expiresAt: new Date(args.now + args.ttlSeconds * 1000).toISOString(),
      revokedAt: null,
    })
    return { usid, jti }
  } catch (error) {
    warn('Session row not written; token issued without a session id', error)
    return null
  }
}

/** Pushes a session's expiry forward when its token is refreshed. Best effort. */
export async function extendSession(store: UserSessionStore, usid: string, expiresAt: Date): Promise<void> {
  try {
    await store.extend(usid, expiresAt.toISOString())
  } catch (error) {
    warn('Session expiry not extended', error)
  }
}

// --- Checking a session -------------------------------------------------------

export type SessionCheck = 'ok' | 'revoked' | 'expired' | 'missing' | 'mismatch' | 'unchecked'

/**
 * Decides whether a token that carries a `usid` is still good.
 *
 * Refuses only on positive evidence. A thrown error from the store is
 * 'unchecked', which callers treat as valid. Also moves `last_seen_at`
 * forward, at most once per `SESSION_TOUCH_INTERVAL_MS`, comparing against the
 * stored value so the throttle holds across isolates without any local state.
 */
export async function checkSession(store: UserSessionStore, claims: SessionClaims, now: number): Promise<SessionCheck> {
  let row: UserSessionRow | null
  try {
    row = await store.findByID(claims.usid)
  } catch (error) {
    warn('Session lookup failed; letting the request through', error)
    return 'unchecked'
  }

  if (!row) return 'missing'
  if (row.userId !== claims.userId) return 'mismatch'
  if (claims.jti !== undefined && row.tokenHash !== hashJti(claims.jti)) return 'mismatch'
  if (row.revokedAt) return 'revoked'
  if (Date.parse(row.expiresAt) <= now) return 'expired'

  const last = row.lastSeenAt ? Date.parse(row.lastSeenAt) : 0
  if (!(now - last < SESSION_TOUCH_INTERVAL_MS)) {
    try {
      await store.touch(row.id, new Date(now).toISOString())
    } catch (error) {
      warn('Session last-seen not written', error)
    }
  }
  return 'ok'
}

/** True unless the check positively says no. */
export const isSessionUsable = (check: SessionCheck): boolean => check === 'ok' || check === 'unchecked'

// --- Ending sessions ----------------------------------------------------------

export async function listSessions(store: UserSessionStore, userId: number, now = Date.now()): Promise<UserSessionRow[]> {
  return store.listActiveForUser(userId, new Date(now).toISOString())
}

/** Ends one session of `userId`. False when it is not theirs or already ended. */
export async function revokeSession(store: UserSessionStore, userId: number, id: string, now = Date.now()): Promise<boolean> {
  return store.revoke(id, userId, new Date(now).toISOString())
}

/** Ends every session of `userId` except the one making the request. With no current id, ends all tracked ones. */
export async function revokeOtherSessions(store: UserSessionStore, userId: number, currentId: string | null, now = Date.now()): Promise<number> {
  return store.revokeForUser(userId, currentId, new Date(now).toISOString())
}

export async function revokeAll(store: UserSessionStore, userId: number, now = Date.now()): Promise<number> {
  return store.revokeForUser(userId, null, new Date(now).toISOString())
}

/** Same as `revokeAll`/`revokeOtherSessions` but never throws: for flows (password reset) that must not fail because of a session table problem. */
export async function revokeQuietly(store: UserSessionStore, userId: number, exceptId: string | null, now = Date.now()): Promise<void> {
  try {
    await store.revokeForUser(userId, exceptId, new Date(now).toISOString())
  } catch (error) {
    warn('Sessions not revoked', error)
  }
}
