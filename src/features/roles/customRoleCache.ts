/**
 * Custom role matrices on the session user.
 *
 * Collection access functions are synchronous, so they cannot look a custom role up themselves.
 * Instead `engine.auth()` attaches the resolved matrix to the user it returns (`attachCustomRole`),
 * and `can()` reads `user.customRolePermissions`. Rows are cached per role id for a short time
 * (a Worker isolate handles many requests); saving or deleting a role clears its entry here, and
 * the TTL bounds how long another isolate can serve a stale matrix.
 *
 * Fails closed: when the role row cannot be loaded the user gets an empty matrix, so a custom role
 * never grants anything it was not seen to grant. Failures are not cached.
 */

import { OWNABLE_RESOURCES, RESOURCES, ALL_ACTIONS, SCOPED_ACTIONS, parseCustomMatrix, type PermissionMatrix, type Resource } from './permissions'

export const CUSTOM_ROLE_TTL_MS = 10_000

export type ResolvedCustomRole = { slug: string; permissions: Partial<PermissionMatrix> }

type CacheEntry = { at: number; role: ResolvedCustomRole | null }

const cache = new Map<number, CacheEntry>()

type EngineLike = {
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

const relationId = (value: unknown): number | null => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Forget one role (or all of them). Called when a role is saved or deleted. */
export function invalidateCustomRole(roleId?: number | string | null): void {
  if (roleId === undefined || roleId === null) {
    cache.clear()
    return
  }
  const id = Number(roleId)
  if (Number.isFinite(id)) cache.delete(id)
}

/**
 * Keeps only what the matrix understands: known resources, boolean actions, and `scope: 'own'` on
 * collections that record their author. Secret resources stay in (can() refuses them anyway).
 */
export function sanitizeRolePermissions(input: unknown): Partial<PermissionMatrix> {
  const source = parseCustomMatrix(input)
  const result: Partial<PermissionMatrix> = {}
  if (!source) return result
  for (const resource of RESOURCES) {
    const perms = (source as Record<string, unknown>)[resource]
    if (typeof perms !== 'object' || perms === null || Array.isArray(perms)) continue
    const clean: Record<string, unknown> = {}
    for (const action of ALL_ACTIONS) {
      const value = (perms as Record<string, unknown>)[action]
      if (typeof value === 'boolean') clean[action] = value
    }
    const hasScopedGrant = SCOPED_ACTIONS.some((a) => clean[a] === true)
    if ((perms as Record<string, unknown>).scope === 'own' && OWNABLE_RESOURCES.includes(resource as Resource) && hasScopedGrant) {
      clean.scope = 'own'
    }
    result[resource] = clean as PermissionMatrix[Resource]
  }
  return result
}

/** Loads one custom role, from the cache when fresh. null means "no such role"; a thrown read is rethrown. */
export async function loadCustomRoleCached(engine: EngineLike, roleId: number, now: number = Date.now()): Promise<ResolvedCustomRole | null> {
  const hit = cache.get(roleId)
  if (hit && now - hit.at < CUSTOM_ROLE_TTL_MS) return hit.role

  const row = await engine.findByID({ collection: 'roles', id: roleId, depth: 0, overrideAccess: true })
  const permissions = row ? parseCustomMatrix((row as { permissions?: unknown }).permissions) : undefined
  const role: ResolvedCustomRole | null =
    row && typeof row.slug === 'string' ? { slug: row.slug, permissions: permissions ?? {} } : null
  cache.set(roleId, { at: now, role })
  return role
}

export type SessionUserLike = Record<string, unknown> & { customRole?: unknown }

/**
 * Returns the user with `customRolePermissions` (plain object) and `customRoleSlug` attached when
 * they have a custom role. Users without one are returned untouched.
 */
export async function attachCustomRole<T extends SessionUserLike | null>(engine: EngineLike, user: T): Promise<T> {
  if (!user) return user
  const roleId = relationId(user.customRole)
  if (roleId === null) return user
  try {
    const role = await loadCustomRoleCached(engine, roleId)
    if (!role) return { ...user, customRolePermissions: {} }
    return { ...user, customRolePermissions: role.permissions, customRoleSlug: role.slug }
  } catch {
    return { ...user, customRolePermissions: {} }
  }
}

/** Test hook: drop everything. */
export function resetCustomRoleCache(): void {
  cache.clear()
}
