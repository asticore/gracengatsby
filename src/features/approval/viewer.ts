import type { AdminContext } from '@/admin/auth'
import type { ReviewViewer } from './permissions'

/** Builds the reviewer from the admin context, or null when nobody is signed in. */
export function viewerFromContext(context: Pick<AdminContext, 'user' | 'isAdmin' | 'can'>): ReviewViewer | null {
  const user = context.user as { id?: unknown; name?: unknown; email?: unknown } | null
  if (!user) return null
  const id = Number(user.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const name = typeof user.name === 'string' && user.name.trim() ? user.name : typeof user.email === 'string' ? user.email : 'Unknown'
  return { id, name, isAdmin: context.isAdmin, can: context.can }
}
