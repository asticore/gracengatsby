import type { Engine } from '@/engine'
import { DEFAULT_SECURITY_SETTINGS, audit, getSecuritySettings } from '@/features/security'
import { defaultLoginTokenStore, type PasswordlessDeps } from '@/features/passwordless'

import { verificationRequired } from './auth'
import { sendLoginCodeEmail, sendMagicLinkEmail } from './emails'

/**
 * Wires the passwordless core to this site: the real token store, the two mail
 * senders, the verification setting, and the audit log. Server only. Kept out of
 * actions.ts because that file may export only server actions.
 */

export type PasswordlessClient = { ip: string | null; userAgent: string | null }

export const passwordlessDepsFor = async (engine: Engine, client: PasswordlessClient): Promise<PasswordlessDeps> => {
  const settings = await getSecuritySettings(engine as never).catch(() => DEFAULT_SECURITY_SETTINGS)
  return {
    engine,
    store: defaultLoginTokenStore,
    settings: settings.passwordless,
    verificationRequired: await verificationRequired(engine),
    mail: { magicLink: sendMagicLinkEmail, loginCode: sendLoginCodeEmail },
    client: { userAgent: client.userAgent, ip: client.ip },
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

/**
 * Which emailed options the sign-in screens may show. Admin screens only see them
 * when the owner allowed admins; the server re-checks the role at sign-in anyway.
 */
export const passwordlessOptions = async (
  engine: Engine,
  area: 'account' | 'admin',
): Promise<{ magicLink: boolean; emailCode: boolean }> => {
  const settings = await getSecuritySettings(engine as never).catch(() => DEFAULT_SECURITY_SETTINGS)
  const allowed = area === 'account' || settings.passwordless.allowForAdmins
  return {
    magicLink: allowed && settings.passwordless.magicLinkEnabled,
    emailCode: allowed && settings.passwordless.emailCodeEnabled,
  }
}
