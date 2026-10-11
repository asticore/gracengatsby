/**
 * Per-document access check for feature routes (schedule, visibility password, edit lock, version
 * delete, preview link, page tree moves).
 *
 * Those routes are gated on their own feature resource (e.g. `admin-schedule`), and can() returns
 * true for a grant that is limited to the user's own documents. So on its own the feature gate lets
 * a user with an own-scoped `pages` role act on any document id. assertDocAccess closes that: when the
 * user's access to the content collection is own-scoped, the target document must have been created
 * by them.
 */

import type { Action, Resource } from './permissions'
import { OWNABLE_RESOURCES, resolveAccess } from './permissions'

export type DocAccessContext = {
  isAdmin?: boolean
  user?: unknown
  engine?: { findByID: (args: any) => Promise<any> }
}

export type DocAccessResult = { ok: true } | { ok: false; status: 403 | 404 }

function idOf(value: unknown): unknown {
  return value && typeof value === 'object' ? (value as { id?: unknown }).id : value
}

/**
 * Admins and users with an unrestricted grant pass without a lookup. An own-scoped grant loads the
 * document (bypassing access, we only need createdBy) and requires createdBy to equal the user's id.
 * Collections that carry no createdBy cannot be scoped, so an own grant fails closed there. A missing
 * document is reported as 404 for own-scoped users (never reveals other people's documents).
 */
export async function assertDocAccess(
  context: DocAccessContext,
  collection: string,
  id: number,
  action: Action = 'update',
): Promise<DocAccessResult> {
  if (context.isAdmin) return { ok: true }
  const user = context.user as { id?: number } | null | undefined
  const level = resolveAccess(user as never, collection as Resource, action)
  if (level !== 'own') return { ok: true }

  const userId = user?.id
  if (userId === undefined || userId === null) return { ok: false, status: 403 }
  if (!OWNABLE_RESOURCES.includes(collection as Resource)) return { ok: false, status: 403 }
  if (!context.engine) return { ok: false, status: 403 }

  let doc: { createdBy?: unknown } | null = null
  try {
    doc = await context.engine.findByID({ collection, id, depth: 0, overrideAccess: true })
  } catch {
    return { ok: false, status: 404 }
  }
  if (!doc) return { ok: false, status: 404 }
  return idOf(doc.createdBy) === userId ? { ok: true } : { ok: false, status: 403 }
}

/** Standard 403 response body for a failed assertDocAccess. */
export function docAccessDenied(result: DocAccessResult): Response {
  const status = (result as { status?: number }).status === 404 ? 404 : 403
  return Response.json({ error: status === 404 ? 'Not found' : 'forbidden' }, { status })
}
