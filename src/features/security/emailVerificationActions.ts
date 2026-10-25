'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { audit, auditContext } from './auditLog'
import { markAccountEmailVerified, type VerifyActor, type VerifyOutcome } from './emailVerificationAdmin'
import { getSecuritySettings } from './settings'

/**
 * Admin only: marks the account with this email address as verified. The role is
 * checked here on the server; hiding the control is only a courtesy.
 */
export async function markEmailVerifiedAction(email: string): Promise<VerifyOutcome> {
  const incoming = await headers()
  const blocked = refuseWhileImpersonating(incoming)
  if (blocked) return { ok: false, message: blocked }

  const engine = await getEngine()
  const { user } = await engine.auth({ headers: incoming }).catch((): { user: null } => ({ user: null }))
  const actor = user ? (user as unknown as VerifyActor) : null

  try {
    return await markAccountEmailVerified(
      {
        findAccount: async (address) => {
          const found = await engine.find({ collection: 'users', where: { email: { equals: address } }, limit: 1, depth: 0, overrideAccess: true })
          return (found.docs[0] as { id: number; emailVerifiedAt?: string | null } | undefined) ?? null
        },
        setVerified: async (id, at) => {
          await engine.update({
            collection: 'users',
            id,
            data: { emailVerifiedAt: at, emailVerifyTokenHash: null, emailVerifyExpiresAt: null },
            overrideAccess: true,
          })
        },
        record: async (detail, target) => {
          try {
            const settings = await getSecuritySettings(engine as never)
            const origin = auditContext(new Request('https://engage.local', { headers: incoming }))
            await audit(
              { action: 'email.verified', actorId: actor?.id ?? null, actorEmail: actor?.email ?? null, collectionSlug: 'users', documentId: target.id, detail: `${target.email}: ${detail}`, ...origin },
              settings,
            )
          } catch {
            // Never fail the action over a log line.
          }
        },
      },
      actor,
      email,
    )
  } catch {
    return { ok: false, message: 'That could not be done just now. Try again.' }
  }
}
