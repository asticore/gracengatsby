/**
 * Pure UI logic for permissions matrix: toggle cells, copy matrices, validate names.
 * No database imports.
 */

import type { PermissionMatrix, Resource, Action } from './permissions'

/**
 * Toggle a single permission cell in the matrix.
 */
export function toggleCell(
  matrix: PermissionMatrix,
  resource: Resource,
  action: Action,
): PermissionMatrix {
  const resourcePerms = matrix[resource] || {}
  const current = resourcePerms[action] ?? false
  return {
    ...matrix,
    [resource]: {
      ...resourcePerms,
      [action]: !current,
    },
  }
}

/**
 * Copy a role's matrix into a new matrix with all resources initialized.
 */
export function copyMatrix(
  sourceMatrix: Partial<PermissionMatrix>,
  allResources: Resource[],
): PermissionMatrix {
  const newMatrix: Record<string, Record<string, boolean>> = {}
  for (const resource of allResources) {
    const sourcePerms = sourceMatrix[resource]
    newMatrix[resource] = sourcePerms ? { ...sourcePerms } : {}
  }
  return newMatrix as PermissionMatrix
}

/**
 * Validate a role name: non-empty, not reserved.
 */
export function validateRoleName(
  name: string,
  builtInRoleSlugs: string[],
): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Role name cannot be empty' }
  }
  const slug = slugify(name)
  if (builtInRoleSlugs.includes(slug)) {
    return { valid: false, error: 'This role name conflicts with a built-in role' }
  }
  return { valid: true }
}

/**
 * Convert a name to a slug.
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Group resources by category for display.
 */
export function groupResources(
  resources: Resource[],
): Record<string, Resource[]> {
  const groups: Record<string, Resource[]> = {
    Collections: [],
    'Settings screens': [],
    'Actions/named': [],
  }

  for (const resource of resources) {
    if (typeof resource === 'string' && resource.startsWith('settings:')) {
      groups['Settings screens'].push(resource)
    } else if (
      typeof resource === 'string' &&
      (resource.startsWith('admin-') || resource === 'preview-link' || resource.includes('.'))
    ) {
      groups['Actions/named'].push(resource)
    } else {
      groups['Collections'].push(resource)
    }
  }

  return groups
}

/**
 * Check if a resource is a SECRET_RESOURCE.
 */
export function isSecretResource(resource: Resource, secretResources: Resource[]): boolean {
  return secretResources.includes(resource)
}

/**
 * Get actions that make sense for a given resource (simplification: always return all 4).
 */
export function getActionsForResource(_resource: Resource): Action[] {
  return ['read', 'create', 'update', 'delete']
}
