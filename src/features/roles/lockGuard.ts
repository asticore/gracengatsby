/**
 * Server side of section/template locks (see ./locks.ts for the rules). Runs before change on pages and
 * page templates, next to contentEditGuard. Admins and system writes (no user) are never blocked.
 *
 * - Create: only admins or holders of the `locks` permission may save lock entries.
 * - Update: changing the locks needs the same; changing locked content needs an unlock role named on
 *   the lock. The STORED locks decide, so sending `locks: {}` together with an edit does not help.
 * - A refused save answers 403 with the name of the locked section.
 *
 * Only the `blocks` tree is compared. Other fields (title, SEO, status) are not locked.
 */

import type { CollectionBeforeChangeHook } from '@/engine'
import { can } from './permissions'
import { checkLockChanges, checkLockedTree, hasAnyLock, isAdminSession, parseLocks, type LockUser } from './locks'

const BLOCKS_FIELD = 'blocks'

const nounFor = (slug: string | undefined): string =>
  slug === 'page-templates' ? 'template' : slug === 'reusable-sections' ? 'reusable section' : 'page'

/** Throws the engine's Forbidden so REST answers 403 with the message. */
async function throwForbidden(message: string): Promise<never> {
  const { Forbidden } = await import('@/localapi/access')
  throw new Forbidden(message)
}

type Doc = Record<string, any> | null | undefined

/**
 * The document the editor is actually changing: the latest draft version for a collection with
 * versions.drafts (one cheap findByID with draft: true), otherwise the live row. If the lookup fails
 * or finds nothing, the live row is used.
 */
async function loadBaseline({ collection, originalDoc, req, id }: { collection: any; originalDoc: Doc; req: any; id: unknown }): Promise<Doc> {
  const drafts = collection?.versions?.drafts
  if (!drafts || typeof id !== 'number' || typeof req?.engine?.findByID !== 'function') return originalDoc
  try {
    const latest = (await req.engine.findByID({ collection: collection.slug, id, depth: 0, draft: true, overrideAccess: true })) as Doc
    if (!latest) return originalDoc
    return latest
  } catch {
    return originalDoc
  }
}

export const lockGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation, collection } = args as any

  if (!req?.user) return
  if (isAdminSession(req.user)) return
  if (!data) return

  const user = req.user as LockUser
  const canManage = can(req.user, 'locks', 'update')
  const noun = nounFor(collection?.slug)

  if (operation === 'create') {
    if (data.locks !== undefined && hasAnyLock(parseLocks(data.locks)) && !canManage) {
      await throwForbidden('Your role cannot lock sections or templates. Ask an admin.')
    }
    return
  }

  // originalDoc is the LIVE row. With drafts on, the document being edited is the latest draft version, so
  // a lock added in a draft (or blocks changed in one) must count: compare against the latest version.
  const baseline = await loadBaseline({ collection, originalDoc, req, id: originalDoc?.id })
  const storedLocks = parseLocks(baseline?.locks)

  if (data.locks !== undefined) {
    const result = checkLockChanges({ user, canManage, original: storedLocks, incoming: parseLocks(data.locks) })
    if ('message' in result) return throwForbidden(result.message)
  }

  if (data[BLOCKS_FIELD] !== undefined && hasAnyLock(storedLocks)) {
    const result = checkLockedTree({
      user,
      locks: storedLocks,
      original: baseline?.[BLOCKS_FIELD] ?? [],
      incoming: data[BLOCKS_FIELD],
      noun,
    })
    if ('message' in result) return throwForbidden(result.message)
  }
}
