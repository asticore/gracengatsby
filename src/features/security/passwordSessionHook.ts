import type { CollectionAfterChangeHook } from '@/engine'

/**
 * Users `afterChange`: a changed password ends the account's other sessions.
 *
 * Covers the admin screens and the REST API (an admin changing their own or
 * somebody else's password). Who the caller is decides what survives:
 *
 *   - Somebody else's account (or no user at all): every tracked session ends.
 *   - Your own account: every session except the one making the request. The
 *     REST route passes `req.currentSessionId` - a string for a device session,
 *     null for a token issued before session management (which has no row to
 *     end, so all rows go and the caller is unaffected).
 *   - Your own account with no request information at all (`undefined`; the
 *     customer profile calls the Local API directly): nothing here - that caller
 *     revokes explicitly once it knows the session it is keeping.
 *
 * The store is imported lazily: this file is reachable from the Users
 * collection config, which the database layer itself imports.
 */

type Req = {
  user?: { id?: number | string } | null
  currentSessionId?: string | null
  engine?: unknown
  headers?: Headers
}

export const revokeSessionsOnPasswordChange: CollectionAfterChangeHook = async (args) => {
  const { doc, data, operation, req } = args as unknown as {
    doc?: { id?: number | string; email?: string }
    data?: { password?: unknown }
    operation?: string
    req?: Req
  }

  try {
    if (operation !== 'update') return doc
    if (typeof data?.password !== 'string' || data.password.length === 0) return doc

    const targetId = Number(doc?.id)
    if (!Number.isInteger(targetId) || targetId <= 0) return doc

    const actorId = req?.user?.id !== undefined ? Number(req.user.id) : null
    const own = actorId !== null && actorId === targetId

    // Every password change through the Users collection is an auth event,
    // whichever screen or route made it. Written before the session logic so
    // that a change with no session to keep (the profile path) is still recorded.
    if (req?.engine) {
      const { recordAuthEvent, originFromHeaders } = await import('./authAudit')
      await recordAuthEvent(
        req.engine,
        { action: 'password.changed', actorId, collectionSlug: 'users', documentId: targetId, detail: own ? 'own account' : 'another account' },
        originFromHeaders(req.headers),
      )
    }

    // A new password ends every remembered device, whoever made the change and whatever happens below.
    const { defaultTrustedDeviceStore } = await import('./trustedDeviceStore')
    const { revokeAllTrustedDevices } = await import('./trustedDevices')
    await revokeAllTrustedDevices(defaultTrustedDeviceStore, targetId)

    let keep: string | null = null
    if (own) {
      if (req?.currentSessionId === undefined) return doc
      keep = req.currentSessionId
    }

    const { defaultUserSessionStore } = await import('./userSessionStore')
    const { revokeOtherSessions } = await import('./userSessions')
    const count = await revokeOtherSessions(defaultUserSessionStore, targetId, keep)

    if (count > 0 && req?.engine) {
      const { audit } = await import('./auditLog')
      const { getSecuritySettings } = await import('./settings')
      const settings = await getSecuritySettings(req.engine as never)
      await audit(
        {
          action: 'session.revoked-all',
          actorId: actorId,
          collectionSlug: 'users',
          documentId: targetId,
          detail: `password changed; sessions ended: ${count}`,
        },
        settings,
      )
    }
  } catch (error) {
    // A session table problem must never stop a password change.
    console.warn(JSON.stringify({ level: 'warn', msg: 'Sessions not revoked after password change', error: String(error) }))
  }
  return doc
}
