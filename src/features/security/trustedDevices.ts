import { coarseIpOf, deviceLabelOf } from './trustedDeviceLabels'

/**
 * "Remember this device": skip the second step on a device the person ticked the box on.
 *
 * Two halves, so neither alone is enough:
 *   - a cookie holding `id.secret.signature`, where the signature is an HMAC of `id.secret`
 *     under the site's auth secret, so a forged or edited cookie is refused without a lookup;
 *   - a row in `eg_trusted_devices` holding only the SHA-256 of `secret`, with an expiry and a
 *     revoked flag, so a person can see and end a device, and a database read yields no cookie.
 *
 * A device is trusted for ONE account: the row's user must match the account signing in. The
 * password is still always checked; this only stands in for the code. Changing the password,
 * switching two-step off or an administrator's reset ends every remembered device
 * (see `revokeAllTrustedDevices`).
 *
 * Pure and edge-safe (Web Crypto only): the store, the secret and the clock are passed in.
 */

export const TRUSTED_DEVICE_COOKIE = 'engage-trusted-device'
/** `last_used_at` is written at most this often per device. */
export const TRUSTED_TOUCH_INTERVAL_MS = 10 * 60_000

export type TrustedDeviceRow = {
  id: string
  userId: number
  /** SHA-256 hex of the cookie's secret part. */
  tokenHash: string
  label: string | null
  /** Truncated on the way in. */
  ip: string | null
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  revokedAt: string | null
}

export type TrustedDeviceStore = {
  insert(row: TrustedDeviceRow): Promise<void>
  findByID(id: string): Promise<TrustedDeviceRow | null>
  /** Not revoked, not expired at `nowIso`, newest first. */
  listActiveForUser(userId: number, nowIso: string): Promise<TrustedDeviceRow[]>
  touch(id: string, at: string): Promise<void>
  /** Only if it belongs to `userId` and is not already revoked. True when a row changed. */
  revoke(id: string, userId: number, at: string): Promise<boolean>
  revokeForUser(userId: number, at: string): Promise<number>
}

export type TrustedDeviceClient = { userAgent?: string | null; ip?: string | null }

export type IssuedTrustedDevice = { token: string; maxAgeSeconds: number; id: string }

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (text: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))).slice(0, 32)
}

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const randomId = (): string => crypto.randomUUID()
const randomSecret = (): string => toHex(crypto.getRandomValues(new Uint8Array(32)))

/** Splits a cookie value. Null when it is not the right shape. */
export function parseTrustedToken(token: string | null | undefined): { id: string; secret: string; signature: string } | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [id, secret, signature] = parts
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(secret) || !/^[0-9a-f]{32}$/.test(signature)) return null
  return { id, secret, signature }
}

/** Reads the device cookie out of a raw `Cookie:` header. */
export function trustedTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === TRUSTED_DEVICE_COOKIE) return rest.join('=') || null
  }
  return null
}

export async function issueTrustedDevice(
  store: TrustedDeviceStore,
  args: { userId: number; days: number; secret: string; client?: TrustedDeviceClient; now?: number },
): Promise<IssuedTrustedDevice> {
  const now = args.now ?? Date.now()
  const id = randomId()
  const secretPart = randomSecret()
  const days = Math.min(90, Math.max(1, Math.trunc(args.days)))
  const expiresAt = new Date(now + days * 86_400_000).toISOString()
  await store.insert({
    id,
    userId: args.userId,
    tokenHash: await sha256Hex(secretPart),
    label: deviceLabelOf(args.client?.userAgent),
    ip: coarseIpOf(args.client?.ip),
    createdAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString(),
    expiresAt,
    revokedAt: null,
  })
  const payload = `${id}.${secretPart}`
  return { id, token: `${payload}.${await sign(payload, args.secret)}`, maxAgeSeconds: days * 86_400 }
}

/** True only for a genuine, unexpired, unrevoked device row that belongs to `userId`. Never throws. */
export async function checkTrustedDevice(
  store: TrustedDeviceStore,
  args: { token: string | null | undefined; userId: number; secret: string; now?: number },
): Promise<boolean> {
  try {
    const parts = parseTrustedToken(args.token)
    if (!parts) return false
    if (!sameText(await sign(`${parts.id}.${parts.secret}`, args.secret), parts.signature)) return false

    const row = await store.findByID(parts.id)
    if (!row || row.userId !== args.userId || row.revokedAt) return false
    const now = args.now ?? Date.now()
    if (Date.parse(row.expiresAt) <= now) return false
    if (!sameText(row.tokenHash, await sha256Hex(parts.secret))) return false

    const last = row.lastUsedAt ? Date.parse(row.lastUsedAt) : 0
    if (!(now - last < TRUSTED_TOUCH_INTERVAL_MS)) {
      await store.touch(row.id, new Date(now).toISOString()).catch((): undefined => undefined)
    }
    return true
  } catch {
    return false
  }
}

export type TrustedDeviceView = { id: string; device: string; ip: string | null; createdAt: string; lastUsedAt: string | null; expiresAt: string }

export async function listTrustedDevices(store: TrustedDeviceStore, userId: number, now = Date.now()): Promise<TrustedDeviceView[]> {
  const rows = await store.listActiveForUser(userId, new Date(now).toISOString())
  return rows.map((row) => ({
    id: row.id,
    device: row.label || 'Unknown device',
    ip: row.ip,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  }))
}

export const revokeTrustedDevice = (store: TrustedDeviceStore, userId: number, id: string, now = Date.now()): Promise<boolean> =>
  store.revoke(id, userId, new Date(now).toISOString())

/** Ends every remembered device of the account. Never throws: callers (password change) must not fail over it. */
export async function revokeAllTrustedDevices(store: TrustedDeviceStore, userId: number, now = Date.now()): Promise<number> {
  try {
    return await store.revokeForUser(userId, new Date(now).toISOString())
  } catch (error) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'Trusted devices not revoked', error: String(error) }))
    return 0
  }
}
