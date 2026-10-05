/**
 * Runtime role resolution for users with optional custom role matrices.
 * Wraps the pure permissions logic in permissions.ts with database lookup.
 */

import type { Engine } from '@/engine'
import type { PermissionMatrix, Resource, Action } from './permissions'
import { can } from './permissions'

/**
 * Represents a user object with optional customRole field.
 * Handles both id and populated object cases.
 */
export type UserWithCustomRole = {
  id?: number
  roles?: string[]
  customRole?: number | { id?: number; permissions?: PermissionMatrix } | null
}

/**
 * Loads a custom role's permission matrix from the database.
 * Returns undefined if the role is not found or on any error.
 *
 * @param engine The database engine instance.
 * @param user The user whose custom role to load.
 * @returns The permission matrix, or undefined on failure.
 */
export async function loadCustomMatrix(
  engine: Engine,
  user: UserWithCustomRole | null | undefined,
): Promise<PermissionMatrix | undefined> {
  if (!user?.customRole) return undefined

  // Extract the role ID (handle both id and populated object)
  let roleId: number | undefined
  if (typeof user.customRole === 'number') {
    roleId = user.customRole
  } else if (user.customRole && typeof user.customRole === 'object' && 'id' in user.customRole) {
    roleId = user.customRole.id
  }

  if (!roleId) return undefined

  try {
    // If already populated, return its permissions directly
    if (typeof user.customRole === 'object' && 'permissions' in user.customRole) {
      return user.customRole.permissions
    }

    // Look up the role from the database with overrideAccess to bypass role checks
    const role = await engine.findByID({
      collection: 'roles',
      id: roleId,
      user: (user as unknown) as any,
      overrideAccess: true,
    })
    if (!role || typeof role.permissions !== 'object') {
      return undefined
    }

    return role.permissions as PermissionMatrix
  } catch {
    // Silently return undefined on any error (database issue, missing role, etc.)
    return undefined
  }
}

/**
 * Async version of the can() function that loads custom matrix if needed.
 *
 * @param engine The database engine instance.
 * @param user The user to check permissions for.
 * @param resource The resource to check access to.
 * @param action The action to check.
 * @returns True if the user can perform the action on the resource.
 */
export async function canAsync(
  engine: Engine,
  user: UserWithCustomRole | null | undefined,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  const customMatrix = await loadCustomMatrix(engine, user)
  return can(user, resource, action, customMatrix)
}
