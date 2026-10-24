'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { headers } from 'next/headers'

import { guardAttempt } from '@/features/accounts/rateLimit'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'

import { isProviderId } from './providers'
import { userHasPassword } from './runtime'
import { resolveUnlink } from './service'
import { defaultSocialStore } from './store'

/**
 * Disconnect a provider from the signed-in account. The user is the session's,
 * never an argument. Refuses to remove the last way in.
 */
export async function unlinkSocialAction(provider: string): Promise<{ ok: boolean; message: string }> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const incoming = await headers()
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: incoming }).catch((): { user: null } => ({ user: null }))
  if (!user) return { ok: false, message: 'Your session has ended. Sign in and try again.' }
  if (!isProviderId(provider)) return { ok: false, message: 'That account is not connected.' }

  const address = incoming.get('cf-connecting-ip') || incoming.get('x-real-ip') || incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const guard = await guardAttempt(engine, 'social', address)
  if (!guard.allowed) return { ok: false, message: 'Too many attempts. Try again in a few minutes.' }

  const userId = Number((user as { id: number | string }).id)
  const outcome = await resolveUnlink({ store: defaultSocialStore, hasPassword: userHasPassword }, userId, provider)
  if (outcome.ok) {
    try {
      const settings = await getSecuritySettings(engine as never)
      const origin = auditContext(new Request('https://engage.local', { headers: incoming }))
      await audit(
        { action: 'social.unlinked', actorId: userId, actorEmail: (user as { email?: string }).email ?? null, collectionSlug: 'users', detail: `${provider} disconnected`, ...origin },
        settings,
      )
    } catch {
      // Never fail the action over a log line.
    }
    return { ok: true, message: 'Disconnected.' }
  }
  return { ok: false, message: outcome.message }
}
