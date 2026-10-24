import type { Engine } from '@/engine'
import { resolveD1Binding } from '@/cms/db/connect'
import { DEFAULT_SECURITY_SETTINGS, audit, getSecuritySettings } from '@/features/security'
import { defaultTwoFactorStore } from '@/features/security/twoFactorStore'
import { isEnrolled, verifySecondFactor } from '@/features/security/twoFactor'
import { type SecuritySettings } from '@/features/security/settings'
import { defaultPasskeyStore, type PasskeyDeps, type PasskeyUser } from '@/features/passkeys'
import { USERS_SLUG } from '@/features/accounts/types'
import { publicOrigin } from '@/features/google/origin'

/**
 * Wires the passkey core to this site: the real store, the users collection, the
 * two-factor store for re-authentication, the social identity table, and the audit
 * log. Server only. Kept apart from the HTTP handlers, as passwordlessWiring is.
 */

export type PasskeyClient = { ip: string | null; userAgent: string | null }

const eligibleEmail = (user: PasskeyUser): boolean => typeof user.email === 'string' && user.email.length > 0

/** Whether the account has a way in other than a passkey. Used to refuse removing the last one. */
const hasOtherSignIn = async (engine: Engine, userId: number, settings: SecuritySettings): Promise<boolean> => {
  const row = await defaultTwoFactorStore.findByID(userId).catch((): null => null)
  if (row && typeof row.salt === 'string' && typeof row.hash === 'string') return true
  try {
    const d1 = await resolveD1Binding()
    const linked = await d1.prepare('SELECT COUNT(*) AS n FROM `eg_social_accounts` WHERE user_id = ?').bind(userId).first<{ n: number }>()
    if (Number(linked?.n ?? 0) > 0) return true
  } catch {
    // No social table on this install: nothing linked.
  }
  const user = (await engine
    .findByID({ collection: USERS_SLUG, id: userId, depth: 0, overrideAccess: true })
    .catch((): null => null)) as PasskeyUser | null
  const emailMethod = settings.passwordless.magicLinkEnabled || settings.passwordless.emailCodeEnabled
  return Boolean(user && eligibleEmail(user) && emailMethod)
}

/** Registration and removal: a signed-in session is necessary, and a password or two-step code is needed when the account has a password. */
export const reauthenticate = async (userId: number, data: { password?: string; code?: string }): Promise<boolean> => {
  const row = await defaultTwoFactorStore.findByID(userId).catch((): null => null)
  if (!row) return false
  const hasPassword = typeof row.salt === 'string' && typeof row.hash === 'string'
  if (!hasPassword) return true
  if (data.password && defaultTwoFactorStore.checkPassword?.(row, data.password)) return true
  if (data.code && isEnrolled(row)) {
    const result = await verifySecondFactor(defaultTwoFactorStore, { id: userId }, data.code).catch(() => ({ ok: false }))
    return Boolean(result.ok)
  }
  return false
}

export const passkeyDepsFor = async (engine: Engine, client: PasskeyClient, requestUrl: string): Promise<PasskeyDeps> => {
  const settings = await getSecuritySettings(engine as never).catch(() => DEFAULT_SECURITY_SETTINGS)
  const origin = publicOrigin(requestUrl)
  const rpId = new URL(origin).hostname
  const rpName = settings.passkeys.rpName || (await siteName(engine))
  return {
    now: () => Date.now(),
    secret: process.env.ENGAGE_SECRET || '',
    origin,
    rpId,
    rpName,
    settings: settings.passkeys,
    store: defaultPasskeyStore,
    userAgent: client.userAgent,
    findUser: async (id): Promise<PasskeyUser | null> =>
      ((await engine.findByID({ collection: USERS_SLUG, id, depth: 0, overrideAccess: true }).catch((): null => null)) as PasskeyUser | null) ?? null,
    loginAsUser: async (userId, skipSecondFactor): Promise<{ token?: string; twoFactorRequired?: boolean; pendingToken?: string }> =>
      (await engine.loginAsUser({ collection: USERS_SLUG, id: userId, client: { userAgent: client.userAgent, ip: client.ip }, skipSecondFactor } as never)) as never,
    reauthenticate,
    hasOtherSignInMethod: (userId) => hasOtherSignIn(engine, userId, settings),
    audit: async (action, detail, userId) => {
      try {
        await audit(
          { action, actorId: userId ?? null, actorEmail: null, collectionSlug: 'users', detail, ip: client.ip, userAgent: client.userAgent },
          settings,
        )
      } catch {
        // A log line must never fail a sign-in.
      }
    },
  }
}

const siteName = async (engine: Engine): Promise<string> => {
  try {
    const globals = (await engine.findGlobal({ slug: 'site-settings' } as never)) as { siteName?: string } | null
    return (globals?.siteName || '').trim() || 'Site'
  } catch {
    return 'Site'
  }
}

/** Whether a sign-in screen should show the passkey button. Off unless the owner switched passkeys on for that area. */
export const passkeySignInAvailable = async (engine: Engine, area: 'account' | 'admin'): Promise<boolean> => {
  const settings = await getSecuritySettings(engine as never).catch((): typeof DEFAULT_SECURITY_SETTINGS => DEFAULT_SECURITY_SETTINGS)
  const allowed = settings.passkeys.enabled && (area === 'account' || settings.passkeys.allowAdmins)
  return allowed && Boolean(process.env.ENGAGE_SECRET)
}
