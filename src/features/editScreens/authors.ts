import { resolveAccess } from '@/features/roles/permissions'
import { BULK_COLLECTIONS, type BulkCollection, type BulkPermissions } from './bulk'

/**
 * Who may be an author and who may change one. Used by the bulk route and by
 * the Author box on the edit screen, so both apply the same rules.
 */

type UserLike = { id?: number | string; name?: unknown; email?: unknown; roles?: unknown; customRole?: unknown }

/** An author is someone who can sign in to the admin: an admin, an editor or a holder of a custom role. */
export function isEligibleAuthor(user: UserLike | null | undefined): boolean {
  if (!user) return false
  const roles = Array.isArray(user.roles) ? user.roles : []
  if (roles.includes('admin') || roles.includes('editor')) return true
  const custom = user.customRole
  return custom !== null && custom !== undefined && custom !== ''
}

export type AuthorOption = { id: number; name: string }

export function authorOption(user: UserLike): AuthorOption | null {
  const id = Number(user.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : typeof user.email === 'string' ? user.email : `User ${id}`
  return { id, name }
}

export const isBulkCollection = (value: unknown): value is BulkCollection => typeof value === 'string' && (BULK_COLLECTIONS as readonly string[]).includes(value)

type PermissionContext = {
  isAdmin: boolean
  user: unknown
  can: (resource: never, action: never) => boolean
}

/** What the signed-in user may do on one collection, from the permission table. */
export function bulkPermissions(context: PermissionContext, collection: BulkCollection): BulkPermissions {
  const can = context.can as unknown as (resource: string, action: string) => boolean
  return {
    isAdmin: context.isAdmin,
    update: context.isAdmin || can(collection, 'update'),
    publish: context.isAdmin || can(collection, 'publish'),
    delete: context.isAdmin || can(collection, 'delete'),
    editOthers: context.isAdmin || resolveAccess(context.user as never, collection, 'update') === 'all',
  }
}
