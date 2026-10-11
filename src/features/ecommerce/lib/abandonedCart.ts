/**
 * Abandoned-cart reminder rules and signed links. Pure apart from the Web
 * Crypto HMAC, so eligibility can be tested without a database.
 */

export type AbandonedSettings = {
  enabled: boolean
  /** Hours after the cart last changed before reminder 1 / reminder 2. */
  firstDelayHours: number
  secondDelayHours: number
  /** 1 or 2 reminders. */
  maxReminders: number
}

export type AbandonedCartRow = {
  email?: string | null
  /** ISO time of the last change to the cart (captured at checkout). */
  updatedAt?: string | null
  remindersSent?: number | null
  lastReminderAt?: string | null
  purchasedAt?: string | null
  recoveredAt?: string | null
  unsubscribed?: boolean | null
  itemCount?: number | null
}

/** A cart is given up on after this long; no reminder is sent beyond it. */
export const MAX_AGE_HOURS = 24 * 14

/** Which reminder (1 or 2) is due for this cart now, or null. */
export function dueReminder(cart: AbandonedCartRow, settings: AbandonedSettings, now: Date = new Date()): 1 | 2 | null {
  if (!settings.enabled) return null
  if (!cart.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cart.email)) return null
  if (cart.purchasedAt || cart.recoveredAt || cart.unsubscribed) return null
  if ((cart.itemCount ?? 1) <= 0) return null
  const changed = cart.updatedAt ? new Date(cart.updatedAt).getTime() : NaN
  if (!Number.isFinite(changed)) return null
  const ageHours = (now.getTime() - changed) / 3_600_000
  if (ageHours > MAX_AGE_HOURS) return null
  const sent = cart.remindersSent ?? 0
  const max = Math.min(2, Math.max(1, Math.floor(settings.maxReminders || 1)))
  if (sent >= max) return null
  const first = Math.max(0.25, settings.firstDelayHours)
  const second = Math.max(first, settings.secondDelayHours)
  if (sent === 0) return ageHours >= first ? 1 : null
  // Reminder 2 is measured from the cart's last change too, and never within an hour of reminder 1.
  const lastReminder = cart.lastReminderAt ? new Date(cart.lastReminderAt).getTime() : 0
  if (now.getTime() - lastReminder < 3_600_000) return null
  return ageHours >= second ? 2 : null
}

const enc = new TextEncoder()
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** `purpose` keeps a recover token from working as an unsubscribe token and vice versa. */
export async function signCartToken(secret: string, cartId: number | string, purpose: 'recover' | 'unsub', expiresAtMs?: number): Promise<string> {
  const exp = expiresAtMs ?? Date.now() + MAX_AGE_HOURS * 3_600_000
  const body = `${cartId}.${exp}.${purpose}`
  return `${cartId}.${exp}.${(await hmac(secret, body)).slice(0, 40)}`
}

export async function verifyCartToken(
  secret: string,
  token: string,
  purpose: 'recover' | 'unsub',
  now = Date.now(),
): Promise<{ ok: true; cartId: number } | { ok: false }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false }
  const [id, exp, sig] = parts
  if (!/^\d+$/.test(id) || !/^\d+$/.test(exp) || !secret) return { ok: false }
  if (Number(exp) < now) return { ok: false }
  const expected = (await hmac(secret, `${id}.${exp}.${purpose}`)).slice(0, 40)
  if (expected.length !== sig.length) return { ok: false }
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0 ? { ok: true, cartId: Number(id) } : { ok: false }
}
