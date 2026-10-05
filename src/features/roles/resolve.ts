import { getUserFromDb } from '@/engine'
import type { TypedUser } from '@/engine'

export interface RolePermissions {
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  canManageUsers: boolean
  canManageRoles: boolean
}

const rolePermissions: Record<string, RolePermissions> = {
  admin: {
    canEdit: true,
    canPublish: true,
    canDelete: true,
    canManageUsers: true,
    canManageRoles: true,
  },
  editor: {
    canEdit: true,
    canPublish: true,
    canDelete: false,
    canManageUsers: false,
    canManageRoles: false,
  },
  viewer: {
    canEdit: false,
    canPublish: false,
    canDelete: false,
    canManageUsers: false,
    canManageRoles: false,
  },
}

export function getPermissions(role: string): RolePermissions {
  return rolePermissions[role] || rolePermissions.viewer
}

export function hasPermission(
  user: TypedUser,
  permission: keyof RolePermissions,
): boolean {
  const permissions = getPermissions(user.role)
  return permissions[permission]
}

export async function resolveUserRole(userId: string): Promise<TypedUser | null> {
  return await getUserFromDb(userId)
}
