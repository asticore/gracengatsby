/**
 * Organisation roles and permissions, as plain data and plain functions.
 *
 * Three built-in roles (owner, admin, member) plus custom role names an
 * organisation defines for itself. Every role maps to a list of actions; other
 * features ask `hasOrgPermission(accountCtx, orgId, action)` and never read a
 * membership row themselves. No database import lives at module load: the
 * default store is loaded on first use, so this file is safe to import anywhere.
 */

export const ORG_ACTIONS = [
  'organization:read',
  'organization:update',
  'organization:delete',
  'organization:transfer',
  'member:read',
  'member:update',
  'member:remove',
  'invitation:read',
  'invitation:create',
  'invitation:cancel',
  'team:read',
  'team:manage',
  'role:manage',
  'content:read',
] as const

export type OrgAction = (typeof ORG_ACTIONS)[number]

export const BUILT_IN_ROLES = ['owner', 'admin', 'member'] as const
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number]

/** Actions only an owner ever holds. A custom role can never carry them. */
export const OWNER_ONLY_ACTIONS: readonly OrgAction[] = ['organization:delete', 'organization:transfer']

export const ROLE_PERMISSIONS: Record<BuiltInRole, readonly OrgAction[]> = {
  owner: ORG_ACTIONS,
  admin: ORG_ACTIONS.filter((action) => !OWNER_ONLY_ACTIONS.includes(action)),
  member: ['organization:read', 'member:read', 'team:read', 'content:read'],
}

export const isBuiltInRole = (role: unknown): role is BuiltInRole => typeof role === 'string' && (BUILT_IN_ROLES as readonly string[]).includes(role)

export const isOrgAction = (action: unknown): action is OrgAction => typeof action === 'string' && (ORG_ACTIONS as readonly string[]).includes(action)

/** Custom role names: lower-case, 2 to 32 characters, never one of the built-in names. */
export const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/

export const validRoleName = (name: unknown): name is string => typeof name === 'string' && ROLE_NAME_PATTERN.test(name) && !isBuiltInRole(name)

/** Keeps only known, non-owner-only actions, once each, in the canonical order. */
export const cleanPermissions = (input: unknown): OrgAction[] => {
  const wanted = Array.isArray(input) ? input : []
  return ORG_ACTIONS.filter((action) => !OWNER_ONLY_ACTIONS.includes(action) && wanted.includes(action))
}

export type CustomRoles = Record<string, readonly string[]>

/** The actions a role grants. An unknown role name grants nothing. */
export const permissionsForRole = (role: string | null | undefined, custom: CustomRoles = {}): readonly OrgAction[] => {
  if (!role) return []
  if (isBuiltInRole(role)) return ROLE_PERMISSIONS[role]
  const own = custom[role]
  return own ? cleanPermissions(own) : []
}

export const roleHasPermission = (role: string | null | undefined, action: OrgAction, custom: CustomRoles = {}): boolean => permissionsForRole(role, custom).includes(action)

/** The slice of the store the permission check needs. */
export type OrgPermissionStore = {
  getMemberRole: (orgId: string, userId: number) => Promise<string | null>
  getCustomRole: (orgId: string, name: string) => Promise<string[] | null>
}

/** What an account screen or action already holds. Only `user` is required. */
export type OrgAccountCtx = {
  user: { id: number | string } | null
  /** Set by callers that already read the Security settings. `false` denies everything. */
  organizationsEnabled?: boolean
  /** Engine to read the Security settings from when `organizationsEnabled` is not given. */
  engine?: unknown
  /** Replaces the database store. For tests and for callers that batch reads. */
  orgStore?: OrgPermissionStore
}

const loadDefaultStore = async (): Promise<OrgPermissionStore> => {
  const { defaultOrgPermissionStore } = await import('./store')
  return defaultOrgPermissionStore
}

const featureOn = async (ctx: OrgAccountCtx): Promise<boolean> => {
  if (typeof ctx.organizationsEnabled === 'boolean') return ctx.organizationsEnabled
  if (!ctx.engine) return true
  try {
    const { getSecuritySettings } = await import('@/features/security/settings')
    const settings = await getSecuritySettings(ctx.engine as never)
    return Boolean(settings.organizations?.enabled)
  } catch {
    return false
  }
}

/**
 * True when the signed-in account holds `action` in organisation `orgId`.
 * Fails closed: no account, no membership, an unknown role, a switched-off
 * feature or any lookup error all answer false.
 */
export async function hasOrgPermission(accountCtx: OrgAccountCtx | null | undefined, orgId: string, action: OrgAction): Promise<boolean> {
  try {
    if (!accountCtx?.user || !orgId || !isOrgAction(action)) return false
    const userId = Number(accountCtx.user.id)
    if (!Number.isFinite(userId)) return false
    if (!(await featureOn(accountCtx))) return false
    const store = accountCtx.orgStore ?? (await loadDefaultStore())
    const role = await store.getMemberRole(orgId, userId)
    if (!role) return false
    if (isBuiltInRole(role)) return roleHasPermission(role, action)
    const custom = await store.getCustomRole(orgId, role)
    return custom ? roleHasPermission(role, action, { [role]: custom }) : false
  } catch {
    return false
  }
}
