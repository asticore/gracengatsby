import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

import { audit, auditContext, type AuditEntry } from './auditLog'
import { getSecuritySettings, invalidateSecuritySettingsCache } from './settings'
import { assertTwoFactorSatisfied, type TwoFactorUser } from './twoFactor'

/**
 * The hooks that turn engine operations into audit entries.
 *
 * They are attached per collection rather than globally because the engine has
 * no config-level afterChange, and because not every collection is worth
 * recording: cart writes happen on every add-to-cart and would bury the
 * entries that matter under shopping noise. Attach these to the collections
 * whose changes someone would want to reconstruct later - see the integration
 * note.
 *
 * Every hook returns its document unchanged and never throws. A hook that can
 * fail a save turns the audit log into a way to break the site.
 */

type ReqLike = {
  user?: TwoFactorUser | null
  headers?: Headers
  payload?: unknown
}

const engineOf = (req: ReqLike) => req?.payload as Parameters<typeof getSecuritySettings>[0]

/** Requests inside the engine carry real headers; background jobs may not. */
const contextOf = (req: ReqLike): Pick<AuditEntry, 'ip' | 'userAgent'> =>
  req?.headers ? auditContext(new Request('https://engage.local', { headers: req.headers })) : {}

async function write(req: ReqLike, entry: AuditEntry): Promise<void> {
  try {
    const engine = engineOf(req)
    if (!engine) return

    const settings = await getSecuritySettings(engine)
    await audit(
      {
        ...entry,
        ...contextOf(req),
        actorId: req?.user?.id ?? null,
        actorEmail: req?.user?.email ?? null,
      },
      settings,
    )
  } catch {
    // See auditLog.ts: recording must never be able to fail the operation.
  }
}

/** Records creates and updates on one collection. */
export const auditAfterChange: CollectionAfterChangeHook = ({ doc, req, operation, collection }) => {
  void write(req as ReqLike, {
    action: operation === 'create' ? 'create' : 'update',
    collectionSlug: collection?.slug ?? null,
    documentId: (doc as { id?: number | string })?.id ?? null,
    detail: describe(doc),
  })
  return doc
}

/** Records deletes. The detail is the only trace left of what was removed. */
export const auditAfterDelete: CollectionAfterDeleteHook = ({ doc, req, collection, id }) => {
  void write(req as ReqLike, {
    action: 'delete',
    collectionSlug: collection?.slug ?? null,
    documentId: id ?? null,
    detail: describe(doc),
  })
  return doc
}

/**
 * Records a settings save, and drops the middleware's cached copy so the new
 * headers and limits take effect on the next request rather than in a minute.
 */
export const auditGlobalAfterChange: GlobalAfterChangeHook = ({ doc, req, global }) => {
  invalidateSecuritySettingsCache()

  void write(req as ReqLike, {
    action: 'settings.update',
    collectionSlug: global?.slug ?? null,
    detail: null,
  })
  return doc
}

/**
 * Records the sign-in and runs the two-factor check.
 *
 * Attach to the admin user collection as an `afterLogin` hook. The check does
 * not currently reject - see the enforcement note in twoFactor.ts - but it
 * writes the reason it would have, so the requirement being unmet is visible
 * in the log rather than silent.
 */
export const auditAfterLogin: CollectionAfterChangeHook = ({ doc, req, collection }) => {
  void (async () => {
    try {
      const engine = engineOf(req as ReqLike)
      if (!engine) return

      const settings = await getSecuritySettings(engine)
      const status = assertTwoFactorSatisfied(doc as TwoFactorUser, settings)

      await audit(
        {
          action: 'login.success',
          ...contextOf(req as ReqLike),
          collectionSlug: collection?.slug ?? null,
          actorId: (doc as { id?: number })?.id ?? null,
          actorEmail: (doc as { email?: string })?.email ?? null,
          detail: status.satisfied ? null : status.reason,
        },
        settings,
      )
    } catch {
      // Never block a sign-in over a log line.
    }
  })()

  return doc
}

/**
 * A short, safe description of what changed.
 *
 * Only the title-ish fields, never the whole document: the log is readable by
 * every admin, and copying documents into it would spread whatever the
 * document held - an order's address, a customer's email - into a second table
 * with a different retention rule and a different audience.
 */
function describe(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null

  const record = doc as Record<string, unknown>
  for (const key of ['title', 'name', 'slug', 'email', 'label']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return `${key}: ${value}`
  }
  return null
}
