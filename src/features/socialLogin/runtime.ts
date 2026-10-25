
import { findUserAuthRowByID } from '@/cms/db/collections/users'
import { guardAttempt } from '@/features/accounts/rateLimit'
import { audit, auditContext, type AuditAction } from '@/features/security/auditLog'
import { SESSION_COOKIE, loginProtectionAuth } from '@/features/security/loginProtection'
import { trustedTokenFromCookieHeader } from '@/features/security/trustedDevices'
import { getSecuritySettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'
import { publicOrigin } from '@/features/google/origin'

import type { SessionUser, SocialRuntime } from './http'
import { hasRealPassword, placeholderPassword } from './passwords'
import type { PolicyDeps, UserLite } from './service'
import { readSocialConfig } from './settings'
import { defaultSocialStore } from './store'

/** The real wiring for the routes: engine, D1, audit log, rate limiter. Server only. */

type EngineT = Awaited<ReturnType<typeof getEngine>>
type UserDoc = { id: number | string; email?: string; roles?: unknown; emailVerifiedAt?: string | null }

const toLite = (doc: UserDoc | null | undefined): UserLite | null =>
  doc
    ? {
        id: Number(doc.id),
        email: String(doc.email ?? ''),
        roles: Array.isArray(doc.roles) ? (doc.roles as string[]) : [],
        emailVerifiedAt: doc.emailVerifiedAt ?? null,
      }
    : null

export function policyDeps(engine: EngineT, config: { allowSignupViaSocial: boolean; allowAdminSocialLogin: boolean }, requireVerification: boolean): PolicyDeps {
  const secret = process.env.ENGAGE_SECRET || ''
  return {
    store: defaultSocialStore,
    settings: { allowSignup: config.allowSignupViaSocial, allowAdmin: config.allowAdminSocialLogin, requireVerification },
    async findUserByEmail(email) {
      const found = await engine.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      return toLite(found.docs[0] as UserDoc | undefined)
    },
    async findUserByID(id) {
      const doc = await engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true }).catch((): null => null)
      return toLite(doc as UserDoc | null)
    },
    async createCustomer(email, verified) {
      const created = (await engine.create({
        collection: 'users',
        // Role fixed here, never taken from the provider. The password is an unusable placeholder.
        data: {
          email,
          password: placeholderPassword(secret, email),
          roles: ['customer'],
          ...(verified ? { emailVerifiedAt: new Date().toISOString() } : {}),
        },
        overrideAccess: true,
      })) as { id: number | string }
      return Number(created.id)
    },
    async markEmailVerified(id) {
      await engine.update({
        collection: 'users',
        id,
        data: { emailVerifiedAt: new Date().toISOString(), emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
        overrideAccess: true,
      })
    },
  }
}

/** Whether the account has a password of its own (not the social placeholder). */
export async function userHasPassword(userId: number): Promise<boolean> {
  const secret = process.env.ENGAGE_SECRET || ''
  const row = (await findUserAuthRowByID(userId).catch((): null => null)) as { salt?: string; hash?: string; email?: string } | null
  const links = await defaultSocialStore.listForUser(userId).catch((): never[] => [])
  return hasRealPassword(row, secret, links.map((l) => l.email))
}

export async function requireVerificationOn(engine: EngineT): Promise<boolean> {
  const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)) as
    | { accountSettings?: { requireEmailVerification?: boolean | null } | null }
    | null
  return settings?.accountSettings?.requireEmailVerification === true
}

const addressOf = (request: Request): string =>
  request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

export async function defaultRuntime(): Promise<SocialRuntime> {
  const engine = await getEngine()
  return {
    secret: process.env.ENGAGE_SECRET || '',
    fetchImpl: fetch,
    now: () => Date.now(),
    origin: (request) => publicOrigin(request.url),
    readConfig: () => readSocialConfig(engine),
    policy: (config) => policyDeps(engine, config, false),
    async sessionUser(request): Promise<SessionUser | null> {
      const { user } = await engine.auth({ headers: request.headers }).catch((): { user: null } => ({ user: null }))
      const u = user as unknown as UserDoc | null
      return u ? { id: Number(u.id), email: String(u.email ?? ''), roles: Array.isArray(u.roles) ? (u.roles as string[]) : [] } : null
    },
    async login(userId, request) {
      const result = await engine.loginAsUser({
        collection: 'users',
        id: userId,
        client: {
          userAgent: request.headers.get('user-agent'),
          ip: addressOf(request) === 'unknown' ? null : addressOf(request),
          // A remembered device stands in for the second-step code; the engine still requires the account match.
          trustedDeviceToken: trustedTokenFromCookieHeader(request.headers.get('cookie')),
        },
      })
      return { token: result.token, pendingToken: result.pendingToken }
    },
    async audit(action: AuditAction, request, entry) {
      try {
        const settings = await getSecuritySettings(engine as never)
        await audit({ action, actorId: entry.actorId ?? null, actorEmail: entry.actorEmail ?? null, collectionSlug: 'users', detail: entry.detail, ...auditContext(request) }, settings)
      } catch {
        // A log line must never fail a sign-in.
      }
    },
    async limited(request) {
      const guard = await guardAttempt(engine, 'social', addressOf(request))
      return !guard.allowed
    },
    sessionCookie: { name: SESSION_COOKIE, maxAgeSeconds: loginProtectionAuth().tokenExpiration },
  }
}

/** Reads the verification setting per request, so the policy sees the live value. */
export async function runtimeWithVerification(): Promise<SocialRuntime> {
  const engine = await getEngine()
  const base = await defaultRuntime()
  const required = await requireVerificationOn(engine)
  return { ...base, policy: (config) => policyDeps(engine, config, required) }
}

