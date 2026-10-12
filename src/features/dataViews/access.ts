import { getAdminContext } from '@/admin/auth'

/**
 * Who may see a view that is not marked public: a signed-in person whose role has the Tables and charts
 * "read" permission. Anyone else is treated exactly as if the view did not exist.
 */
export async function canReadPrivateViews(): Promise<boolean> {
  try {
    const context = await getAdminContext()
    return Boolean(context.user) && (context.isAdmin || context.can('data-views', 'read'))
  } catch {
    return false
  }
}

/** Who may use the editor's helper endpoints (field lists, live preview). */
export async function adminCan(action: 'read' | 'create' | 'update'): Promise<boolean> {
  try {
    const context = await getAdminContext()
    return Boolean(context.user) && (context.isAdmin || context.can('data-views', action))
  } catch {
    return false
  }
}
