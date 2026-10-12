/**
 * Before-change hooks for the edit-screens audit: the trash rules and the
 * "Edit SEO settings" permission. Both skip system writes (no `req.user`) and
 * never block admins, like the other guards in src/features/roles.
 */

import type { CollectionBeforeChangeHook } from '@/engine'
import { can } from '@/features/roles/permissions'

/** Throws the engine's ValidationError so REST answers 400 with the message. */
async function throwValidation(path: string, message: string): Promise<never> {
  const { ValidationError } = await import('@/localapi/operations')
  throw new ValidationError([{ path, message }])
}

const isAdminUser = (user: { roles?: string[] } | undefined): boolean => Boolean(user?.roles?.includes('admin'))

/**
 * Trash rules.
 *  - A document in the trash is always a draft, so it drops off the public site the moment it is trashed.
 *  - The homepage cannot be trashed.
 *  - Moving a document into or out of the trash needs the Delete permission on the collection
 *    (a role that can only edit cannot change the trash flag by sending it directly).
 */
export const trashGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, collection } = args as any
  if (!data) return

  const effectiveTrashed = 'trashedAt' in data ? data.trashedAt : originalDoc?.trashedAt
  if (data._status === 'published' && originalDoc?.trashedAt && effectiveTrashed) {
    await throwValidation('_status', 'Restore this from the trash before publishing it.')
  }
  if (data.isHomepage && effectiveTrashed) {
    await throwValidation('isHomepage', 'A document in the trash cannot be the homepage.')
  }
  if (!('trashedAt' in data)) {
    return
  }

  const was = Boolean(originalDoc?.trashedAt)
  const now = Boolean(data.trashedAt)

  if (req?.user && !isAdminUser(req.user) && was !== now) {
    const slug = String(collection?.slug ?? '')
    if (!can(req.user, slug as never, 'delete')) {
      // Keep the stored value; the rest of the save goes ahead.
      data.trashedAt = originalDoc?.trashedAt ?? null
      return
    }
  }

  if (now) {
    const isHome = 'isHomepage' in data ? Boolean(data.isHomepage) : Boolean(originalDoc?.isHomepage)
    if (isHome) await throwValidation('trashedAt', 'The homepage cannot be moved to the trash. Choose another homepage first.')
    data._status = 'draft'
  }
}

/** The stored SEO group in the shape a save carries: uploads as ids, not populated objects. */
export function storedSeo(seo: unknown): Record<string, unknown> | undefined {
  if (!seo || typeof seo !== 'object') return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(seo as Record<string, unknown>)) {
    out[key] = value && typeof value === 'object' && 'id' in (value as object) ? (value as { id: unknown }).id : value
  }
  return out
}

/**
 * Enforces `content.editSeo`. A user without it keeps the stored SEO settings
 * whatever the request carries (the edit form sends every field back, so this
 * restores rather than rejects), and a new document starts with none.
 */
export const seoEditGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation } = args as any
  const args_collection = (a: any) => a?.collection?.slug
  if (!req?.user || !data) return
  if (isAdminUser(req.user)) return
  if (can(req.user, 'content.editSeo', 'update')) return

  if (operation === 'create') {
    delete data.seo
    return
  }
  if ('seo' in data) {
    // Baseline is the latest draft, not the published doc, so a draft save or a
    // version restore cannot reset or smuggle SEO changes.
    let baseline: any = originalDoc
    const id = originalDoc?.id
    const slug = String(args_collection(args) ?? '')
    if (id != null && slug) {
      try {
        const { getEngine } = await import('@/engine')
        const engine = await getEngine()
        const latest = await (engine as any).findByID({ collection: slug, id, depth: 0, draft: true, overrideAccess: true })
        if (latest) baseline = latest
      } catch {
        // keep the original doc
      }
    }
    const stored = storedSeo(baseline?.seo)
    if (stored) data.seo = stored
    else delete data.seo
  }
}
