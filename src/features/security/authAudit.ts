import { audit, impersonatorTag, type AuditAction, type AuditEntry } from './auditLog'
import { getSecuritySettings } from './settings'

/**
 * One call every auth call site uses to write its audit line.
 *
 * The caller passes whichever engine it has and the origin it already holds
 * (an address and agent from the request). This never throws: settings can be
 * unreadable on a misconfigured site and the audit write itself already fails
 * open, so an event that cannot be recorded never changes what the person
 * sees - a sign-in still succeeds, a sign-out still clears the cookie.
 */

export type AuthEvent = Omit<AuditEntry, 'action' | 'ip' | 'userAgent'> & {
  action: AuditAction
}

export type AuthOrigin = { ip?: string | null; userAgent?: string | null; cookie?: string | null }

export async function recordAuthEvent(
  engine: unknown,
  event: AuthEvent,
  origin: AuthOrigin = {},
): Promise<void> {
  try {
    const settings = await getSecuritySettings(engine as Parameters<typeof getSecuritySettings>[0])
    // Tagged with the real admin when this request is an admin signed in as a customer.
    const tag = await impersonatorTag(origin.cookie, event.actorId)
    await audit({ ip: origin.ip ?? null, userAgent: origin.userAgent ?? null, ...event, ...(tag ?? {}) }, settings)
  } catch {
    // Recording must never be able to fail the request it describes.
  }
}

/** The address and agent from a request's headers, in the shape `recordAuthEvent` takes. */
export function originFromHeaders(headers: Headers | null | undefined): AuthOrigin {
  if (!headers) return {}
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  return {
    ip: headers.get('cf-connecting-ip') || headers.get('x-real-ip') || forwarded,
    userAgent: headers.get('user-agent'),
    // Only the impersonation tag reads this, and only when the request carries a cookie.
    ...(headers.get('cookie') ? { cookie: headers.get('cookie') } : {}),
  }
}
