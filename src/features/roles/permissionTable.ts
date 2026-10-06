/**
 * Pure helpers for PermissionTable component.
 * - Toggle category/column permissions
 * - Filter/count/cycle tri-state
 */

import type { PermissionMatrix, PermissionOverrides, Resource, Action } from './permissions'
import { PERMISSION_CATEGORIES } from './permissions'

/**
 * Get all resources in a category.
 */
export function getResourcesInCategory(categoryId: string): Resource[] {
  const category = PERMISSION_CATEGORIES.find(c => c.id === categoryId)
  return category?.rows.map(r => r.resource) ?? []
}

/**
 * Toggle all permissions in a category (for a specific action).
 */
export function toggleCategory(
  value: Partial<PermissionMatrix>,
  categoryId: string,
  action: Action,
  enable: boolean,
): Partial<PermissionMatrix> {
  const resources = getResourcesInCategory(categoryId)
  const result = { ...value }

  for (const resource of resources) {
    const resourcePerms = result[resource] || {}
    result[resource] = {
      ...resourcePerms,
      [action]: enable,
    }
  }

  return result
}

/**
 * Toggle all permissions in a column (for all categories).
 */
export function toggleColumn(
  value: Partial<PermissionMatrix>,
  action: Action,
  enable: boolean,
): Partial<PermissionMatrix> {
  let result = { ...value }

  for (const category of PERMISSION_CATEGORIES) {
    result = toggleCategory(result, category.id, action, enable)
  }

  return result
}

/**
 * Cycle a tri-state control: Inherit -> Allow -> Deny -> Inherit.
 */
export function cycleTriState(
  current: boolean | undefined,
): boolean | undefined {
  // undefined (inherit) -> true (allow) -> false (deny) -> undefined (inherit)
  if (current === undefined) return true
  if (current === true) return false
  return undefined
}

/**
 * Count how many permissions are enabled in a category for all actions.
 */
export function countEnabledInCategory(
  value: Partial<PermissionMatrix>,
  categoryId: string,
): number {
  const resources = getResourcesInCategory(categoryId)
  let count = 0

  for (const resource of resources) {
    const perms = value[resource]
    if (perms && (perms.read || perms.create || perms.update || perms.delete || perms.publish)) {
      count++
    }
  }

  return count
}

/**
 * Get count of enabled vs total in a category for a specific action.
 */
export function getCategoryActionCount(
  value: Partial<PermissionMatrix>,
  categoryId: string,
  action: Action,
): { enabled: number; total: number } {
  const resources = getResourcesInCategory(categoryId)
  let enabled = 0

  for (const resource of resources) {
    if (value[resource]?.[action]) {
      enabled++
    }
  }

  return { enabled, total: resources.length }
}

/**
 * Filter categories and rows by search term.
 */
export function filterBySearch(
  searchTerm: string,
): Array<{
  id: string
  label: string
  rows: Array<{
    resource: Resource
    label: string
    description?: string
    actions: Action[]
  }>
}> {
  if (!searchTerm.trim()) return PERMISSION_CATEGORIES

  const lower = searchTerm.toLowerCase()
  const filtered = []

  for (const category of PERMISSION_CATEGORIES) {
    const matchedRows = category.rows.filter(
      (row) => row.label.toLowerCase().includes(lower) || row.resource.toLowerCase().includes(lower),
    )
    if (matchedRows.length > 0) {
      filtered.push({
        ...category,
        rows: matchedRows,
      })
    }
  }

  return filtered
}

/**
 * Set override state in grant/deny matrices.
 */
export function setOverrideState(
  overrides: PermissionOverrides,
  resource: Resource,
  action: Action,
  state: 'allow' | 'deny' | 'inherit',
): PermissionOverrides {
  const result: PermissionOverrides = {
    grant: { ...overrides.grant },
    deny: { ...overrides.deny },
  }

  const resourceGrant = result.grant?.[resource] ? { ...result.grant[resource] } : {}
  const resourceDeny = result.deny?.[resource] ? { ...result.deny[resource] } : {}

  if (state === 'allow') {
    resourceGrant[action] = true
    delete resourceDeny[action]
  } else if (state === 'deny') {
    resourceDeny[action] = true
    delete resourceGrant[action]
  } else {
    // inherit
    delete resourceGrant[action]
    delete resourceDeny[action]
  }

  if (Object.keys(resourceGrant).length > 0) {
    if (!result.grant) result.grant = {}
    result.grant[resource] = resourceGrant
  } else if (result.grant) {
    delete result.grant[resource]
  }

  if (Object.keys(resourceDeny).length > 0) {
    if (!result.deny) result.deny = {}
    result.deny[resource] = resourceDeny
  } else if (result.deny) {
    delete result.deny[resource]
  }

  // Clean up empty matrices
  if (!result.grant || Object.keys(result.grant).length === 0) {
    delete result.grant
  }
  if (!result.deny || Object.keys(result.deny).length === 0) {
    delete result.deny
  }

  return result
}