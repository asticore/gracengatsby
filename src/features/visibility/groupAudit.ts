import type { AuditAction } from '@/features/security/auditLog'

/**
 * One audit line for a password group event (create, rotate, delete, assign, unlock attempt).
 *
 * Never throws and never blocks the request: the engine, the settings and the audit write can all be
 * unavailable, and none of that may change what the visitor or admin sees. Never records a password or a
 * hash; `detail` carries only the group name and the document reference.
 */
export async function recordGroupEvent(args: {
  action: AuditAction
  headers?: Headers | null
  actor?: { id?: number | string | null; email?: string | null } | null
  groupId?: number | null
  detail?: string
}): Promise<void> {
  try {
    const [{ getEngine }, { recordAuthEvent, originFromHeaders }] = await Promise.all([
      import('@/lib/engine'),
      import('@/features/security/authAudit'),
    ])
    const engine = await getEngine()
    await recordAuthEvent(
      engine,
      {
        action: args.action,
        actorId: args.actor?.id ?? null,
        actorEmail: args.actor?.email ?? null,
        collectionSlug: 'password-groups',
        documentId: args.groupId ?? null,
        detail: args.detail ?? null,
      },
      originFromHeaders(args.headers ?? null),
    )
  } catch {
    // Recording must never fail the request it describes.
  }
}
