import { randomBytes, sha256, toBase64Url, utf8 } from '@/features/passkeys/encoding'

import { isBuiltInRole, validRoleName } from './permissions'

/**
 * The organisation rules that need no database: names, slugs, metadata, who may
 * change whom, and whether an invitation can still be used. The service calls
 * these in a fixed order and supplies the side effects.
 */

export const MAX_NAME = 80
export const MAX_METADATA_BYTES = 4000
export const INVITE_TTL_DAYS = 7
export const INVITE_TOKEN_PREFIX = 'orgi_'

export const normaliseName = (input: unknown): string | null => {
  if (typeof input !== 'string') return null
  const value = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return value.length >= 2 && value.length <= MAX_NAME ? value : null
}

const RESERVED_SLUGS = new Set(['new', 'invite', 'create', 'admin', 'api'])

/** Lower-case letters, digits and single hyphens, 2 to 48 characters. Null when nothing usable is left. */
export const normaliseSlug = (input: unknown): string | null => {
  if (typeof input !== 'string') return null
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug.length >= 2 && !RESERVED_SLUGS.has(slug) ? slug : null
}

/** A logo is optional: an https address or a site path, nothing else (no data: or javascript: addresses). */
export const normaliseLogo = (input: unknown): { ok: boolean; value: string | null } => {
  if (input === undefined || input === null) return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, value: null }
  const value = input.trim()
  if (value === '') return { ok: true, value: null }
  if (value.length > 500 || /[\u0000-\u001f\s]/.test(value)) return { ok: false, value: null }
  if (value.startsWith('/') && !value.startsWith('//')) return { ok: true, value }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? { ok: true, value } : { ok: false, value: null }
  } catch {
    return { ok: false, value: null }
  }
}

/** Metadata is a flat-ish JSON object, kept as text. Accepts an object or a JSON string; at most 4000 bytes. */
export const normaliseMetadata = (input: unknown): { ok: boolean; value: string | null } => {
  if (input === undefined || input === null || input === '') return { ok: true, value: null }
  try {
    const parsed = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, value: null }
    const text = JSON.stringify(parsed)
    return text.length <= MAX_METADATA_BYTES ? { ok: true, value: text } : { ok: false, value: null }
  } catch {
    return { ok: false, value: null }
  }
}

export const parseMetadata = (text: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = text ? (JSON.parse(text) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const normaliseEmail = (input: unknown): string | null => {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  return value.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null
}

export const normaliseTeamName = normaliseName

/** A role that can be given at all: built-in or a well-formed custom name. Whether the custom one exists is the service's check. */
export const roleShapeOk = (role: unknown): role is string => isBuiltInRole(role) || validRoleName(role)

/**
 * Whether `actorRole` may change or remove a member holding `targetRole`.
 * Owners may manage anyone; an admin may manage anyone except an owner; nobody else manages anyone.
 */
export const mayManageMember = (actorRole: string | null | undefined, targetRole: string | null | undefined): boolean => {
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') return targetRole !== 'owner'
  return false
}

/** Whether `actorRole` may hand out `newRole`. Only an owner makes owners. */
export const mayAssignRole = (actorRole: string | null | undefined, newRole: string): boolean => {
  if (newRole === 'owner') return actorRole === 'owner'
  return actorRole === 'owner' || actorRole === 'admin'
}

export const isLastOwner = (members: { userId: number; role: string }[], userId: number): boolean => {
  const owners = members.filter((member) => member.role === 'owner')
  return owners.length === 1 && owners[0].userId === userId
}

export type InviteState = { status: string; expiresAt: string }
export type InviteProblem = 'used' | 'canceled' | 'declined' | 'expired'

/** Null when the invitation can be accepted or declined right now. */
export const inviteProblem = (invite: InviteState, now: number): InviteProblem | null => {
  if (invite.status === 'accepted') return 'used'
  if (invite.status === 'canceled') return 'canceled'
  if (invite.status === 'declined') return 'declined'
  if (invite.status !== 'pending') return 'used'
  const expires = Date.parse(invite.expiresAt)
  if (!Number.isFinite(expires) || expires <= now) return 'expired'
  return null
}

export const inviteExpiry = (now: number, days = INVITE_TTL_DAYS): string => new Date(now + Math.max(1, days) * 86_400_000).toISOString()

export const generateInviteToken = (): string => INVITE_TOKEN_PREFIX + toBase64Url(randomBytes(32))

/** Lower-case hex SHA-256. Only this is stored; the token itself exists only in the email. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await sha256(utf8(token))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export const isInviteTokenShape = (token: unknown): token is string => typeof token === 'string' && token.startsWith(INVITE_TOKEN_PREFIX) && token.length === INVITE_TOKEN_PREFIX.length + 43 && /^[A-Za-z0-9_-]+$/.test(token.slice(INVITE_TOKEN_PREFIX.length))
