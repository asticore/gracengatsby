import type { ImpersonationSettings } from '@/features/security/settings'

/**
 * The rules for "sign in as customer", as plain functions.
 *
 * Nothing here touches a database, a cookie jar or the engine. The service
 * (service.ts) calls these in a fixed order and supplies the side effects, so
 * every refusal can be tested with doubles. The server actions (actions.ts)
 * read the request and hand these functions what they need.
 *
 * Who may impersonate whom:
 *   - only an admin, only with impersonation switched on;
 *   - only a customer: an account whose roles include `customer` and none of
 *     admin / editor / viewer;
 *   - never oneself, never a locked account;
 *   - with a reason of at least five characters and a fresh re-authentication
 *     (password or authenticator code);
 *   - with two-step sign-in or a passkey on the admin's account when the
 *     owner requires it.
 *
 * While impersonating, the request carries the impersonated token in the
 * `engage-imp` cookie. `isImpersonating` is the single test the restricted
 * actions use. It fails closed: the mere presence of that cookie refuses,
 * even when its value is empty or unreadable.
 */

/** Holds the impersonated session token. Separate from the admin's own `engage-token`, so ending impersonation restores the admin without a second sign-in. */
export const IMPERSONATION_COOKIE = 'engage-imp'

/** The admin's own session cookie. Read-only from this feature: never written, never replaced. */
export const ADMIN_SESSION_COOKIE = 'engage-token'

export const MIN_REASON_LENGTH = 5
export const MAX_REASON_LENGTH = 300
export const MIN_MINUTES = 5
export const MAX_MINUTES = 120

export type Refusal =
  | 'disabled'
  | 'not_admin'
  | 'already_impersonating'
  | 'reason'
  | 'target_missing'
  | 'self'
  | 'not_customer'
  | 'locked'
  | 'second_factor_required'
  | 'customer_two_step'
  | 'reauth_failed'
  | 'start_failed'

export const REFUSAL_MESSAGES: Record<Refusal, string> = {
  disabled: 'Signing in as a customer is switched off on this site.',
  not_admin: 'Only an administrator can sign in as a customer.',
  already_impersonating: 'You are already signed in as a customer. Stop that session first.',
  reason: `Give a reason of at least ${MIN_REASON_LENGTH} characters.`,
  target_missing: 'No account has that email address.',
  self: 'You cannot sign in as yourself.',
  not_customer: 'You can only sign in as a customer account.',
  locked: 'That account is locked. Unlock it before signing in as the customer.',
  second_factor_required: 'Turn on two-step sign-in or add a passkey to your account first. The site owner requires it.',
  customer_two_step: 'That customer uses two-step sign-in, so an administrator cannot sign in as them.',
  reauth_failed: 'Your password or authenticator code is not correct.',
  start_failed: 'The session could not be started just now. Try again.',
}

export const REFUSED_WHILE_IMPERSONATING = 'Not available while you are signed in as a customer. Stop impersonating to do this.'

/** Clamps the configured lifetime to 5..120 minutes, whatever value arrives. */
export const clampMinutes = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 30
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.trunc(parsed)))
}

/** Seconds the impersonated session may live: the configured minutes, never longer than an ordinary session. */
export const sessionSecondsFor = (maxMinutes: number, ordinarySeconds: number): number => Math.min(clampMinutes(maxMinutes) * 60, ordinarySeconds)

/** A reason is required: trimmed, whitespace collapsed, control characters removed, and of a sensible length. */
export const normaliseReason = (input: unknown): { ok: true; value: string } | { ok: false } => {
  if (typeof input !== 'string') return { ok: false }
  const value = input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (value.length < MIN_REASON_LENGTH || value.length > MAX_REASON_LENGTH) return { ok: false }
  return { ok: true, value }
}

export const isAdminRoles = (roles: unknown): boolean => Array.isArray(roles) && roles.includes('admin')

/** A customer is an account with the customer role and no staff role. */
export const isCustomerRoles = (roles: unknown): boolean => {
  if (!Array.isArray(roles)) return false
  if (roles.some((role) => role === 'admin' || role === 'editor' || role === 'viewer')) return false
  return roles.includes('customer')
}

export type HeadersLike = { get: (name: string) => string | null | undefined }

/** Reads one cookie from a Cookie header. Returns null when absent, '' when present but empty. Last occurrence wins, like the engine's own reader. */
export const cookieValue = (headers: HeadersLike, name: string): string | null => {
  const raw = headers.get('Cookie')
  if (raw === null || raw === undefined) return null
  let found: string | null = null
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    const key = (eq === -1 ? part : part.slice(0, eq)).trim()
    if (key !== name) continue
    found = eq === -1 ? '' : part.slice(eq + 1).trim()
  }
  return found
}

/**
 * The one test the restricted actions use. True when the impersonation cookie
 * is present at all. Fails closed: a cookie that cannot be read still counts.
 */
export const isImpersonating = (headers: HeadersLike): boolean => {
  const raw = headers.get('Cookie')
  if (!raw) return false
  return raw.split(';').some((part) => part.trim().split('=')[0] === IMPERSONATION_COOKIE)
}

/** Returns the refusal message to show when the request is impersonating, or null when it may proceed. */
export const refuseWhileImpersonating = (headers: HeadersLike): string | null => (isImpersonating(headers) ? REFUSED_WHILE_IMPERSONATING : null)

/**
 * The headers to authenticate a storefront request with. While impersonating,
 * the impersonated token takes the place of the admin's own session cookie, so
 * the engine resolves the customer. Authorization headers are dropped in that
 * case, because the engine reads them before any cookie. Outside impersonation
 * the headers pass through untouched.
 */
export const headersForCustomerView = (incoming: HeadersLike): HeadersLike => {
  const imp = cookieValue(incoming, IMPERSONATION_COOKIE)
  if (imp === null) return incoming
  const rewritten = (incoming.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith(`${ADMIN_SESSION_COOKIE}=`) && !part.startsWith(`${IMPERSONATION_COOKIE}=`))
    .concat(`${ADMIN_SESSION_COOKIE}=${imp}`)
    .join('; ')
  return {
    get: (name: string) => {
      const lower = name.toLowerCase()
      if (lower === 'cookie') return rewritten
      if (lower === 'authorization') return null
      return incoming.get(name)
    },
  }
}

/** Preflight: the checks that need no lookup, in the order they are applied. Returns the first refusal, or null. */
export const preflight = (input: {
  settings: ImpersonationSettings
  adminRoles: unknown | null
  alreadyImpersonating: boolean
  reason: unknown
}): Refusal | null => {
  if (!input.settings.enabled) return 'disabled'
  if (!isAdminRoles(input.adminRoles)) return 'not_admin'
  if (input.alreadyImpersonating) return 'already_impersonating'
  if (!normaliseReason(input.reason).ok) return 'reason'
  return null
}

/** Checks against the target account, in order. Returns the first refusal, or null. */
export const targetProblem = (input: { adminId: number; target: { id: number; roles: unknown; locked: boolean } | null }): Refusal | null => {
  if (!input.target) return 'target_missing'
  if (input.target.id === input.adminId) return 'self'
  if (!isCustomerRoles(input.target.roles)) return 'not_customer'
  if (input.target.locked) return 'locked'
  return null
}

/**
 * Reads a token's claims WITHOUT verifying the signature. Only for finding the
 * row a stop should end, and only ever used with a server-side lookup keyed by
 * a random id. Never used to decide who someone is.
 */
export const unverifiedClaims = (token: string | null | undefined): Record<string, unknown> | null => {
  try {
    const segment = typeof token === 'string' ? token.split('.')[1] : undefined
    if (!segment) return null
    const parsed = JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Whether an impersonation row really describes the request's actor, so an
 * audit line may name the admin behind it. Only an open, unexpired row for
 * this exact customer counts. A forged or stale cookie matches no such row.
 */
export const auditTagFor = (
  row: { adminId: number; targetUserId: number; endedAt: string | null; expiresAt: string } | null,
  actorId: number | string,
  now: number,
): { actorId: number; impersonating: number } | null => {
  if (!row || row.endedAt) return null
  if (Date.parse(row.expiresAt) <= now) return null
  if (Number(actorId) !== row.targetUserId) return null
  return { actorId: row.adminId, impersonating: row.targetUserId }
}
