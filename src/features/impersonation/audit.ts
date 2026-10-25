import { impersonationIdFromClaims } from './service'
import { auditTagFor, cookieValue, IMPERSONATION_COOKIE, unverifiedClaims } from './policy'
import { defaultImpersonationStore } from './store'

/**
 * The audit tag for a request made while an admin is signed in as a customer.
 * Server-only: it reads the impersonation table. Reached through
 * `impersonatorTag` in auditLog.ts, which loads this module on demand.
 *
 * The cookie's claims are read without verifying the signature, which is safe
 * here for the same reason `stopImpersonationAction` relies on it: the id only
 * selects a row, and the row must then match the request's actor and be open.
 * Nothing about who the actor is comes from the cookie.
 */
export async function impersonatorForAudit(
  cookieHeader: string,
  actorId: number | string,
): Promise<{ actorId: number; actorEmail: string; impersonating: number } | null> {
  const token = cookieValue({ get: () => cookieHeader }, IMPERSONATION_COOKIE)
  const impId = impersonationIdFromClaims(unverifiedClaims(token))
  if (!impId) return null
  const row = await defaultImpersonationStore.findByID(impId)
  const tag = auditTagFor(row, actorId, Date.now())
  if (!tag || !row) return null
  return { ...tag, actorEmail: row.adminEmail }
}
