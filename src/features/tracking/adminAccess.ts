import 'server-only'

import { getAdminContext } from '@/admin/auth'

/**
 * Real admin check for tracking: a signed-in user with the admin role, or with the tracking permission. This
 * asks the engine for the session on every call (getAdminContext is cached per request), so a leftover cookie
 * on its own never counts. Never throws: any failure means "not an admin".
 */
export async function isSignedInTrackingAdmin(action: 'read' | 'create' = 'read'): Promise<boolean> {
  try {
    const context = await getAdminContext()
    if (!context.user) return false
    return context.isAdmin || context.can('tracking', action)
  } catch {
    return false
  }
}
