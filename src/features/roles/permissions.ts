/**
 * Pure permissions logic for role-based access control.
 * No database imports - this is purely for computing user capabilities.
 */

export const RESOURCES = [
  'pages',
  'posts',
  'media',
  'products',
  'orders',
  'events',
  'forms',
  'redirects',
  'users',
  'roles',
  'faqs',
  'field-groups',
  'event-rsvps',
  'page-templates',
  'preferences',
  'memberships',
  'membership-tiers',
  'lessons',
  'courses',
  'enrolments',
  'lesson-progress',
  'carts',
  'transactions',
  'addresses',
  'ab-tests',
  'audit-log',
  'backups',
  'translations',
  'form-submissions',
  'locked-documents',
  'settings:site-settings',
  'settings:blog-settings',
  'settings:faq-settings',
  'settings:form-settings',
  'settings:email-settings',
  'settings:media-settings',
  'settings:member-settings',
  'settings:payment-settings',
  'settings:shop-settings',
  'settings:seo-settings',
  'settings:language-settings',
  'settings:backup-settings',
  'settings:speed-settings',
  'settings:security-settings',
  'settings:integrations',
  'versions.delete',
  'admin-schedule',
  'admin-visibility-password',
  'admin-edit-lock',
  'preview-link',
  'admin-version-delete',
  'admin-pages-tree',
] as const

export type Resource = (typeof RESOURCES)[number]
export type Action = 'read' | 'create' | 'update' | 'delete'

export const ACTIONS: Action[] = ['read', 'create', 'update', 'delete']

export type PermissionMatrix = Record<Resource, Partial<Record<Action, boolean>>>

/**
 * Resources that should ALWAYS be denied to non-admins, even if a custom
 * matrix explicitly grants permission.
 */
export const SECRET_RESOURCES: Resource[] = [
  'settings:integrations',
  'settings:security-settings',
  'settings:payment-settings',
  'settings:email-settings',
  'users',
  'roles',
]

/**
 * Built-in role permission matrices.
 */
export const BUILT_IN_ROLES: Record<string, PermissionMatrix> = {
  admin: Object.fromEntries(
    RESOURCES.map((r) => [
      r,
      {
        read: true,
        create: true,
        update: true,
        delete: true,
      },
    ]),
  ) as PermissionMatrix,

  editor: {
    pages: { read: true, create: true, update: true, delete: true },
    posts: { read: true, create: true, update: true, delete: true },
    media: { read: true, create: true, update: true, delete: true },
    'page-templates': { read: true, create: true, update: true, delete: true },
    faqs: { read: true, create: true, update: true, delete: true },
    events: { read: true, create: true, update: true, delete: true },
    redirects: { read: true, create: true, update: true, delete: true },
    forms: { read: true, create: true, update: true, delete: true },
    'form-submissions': { read: true },
    'field-groups': { read: true, create: true, update: true, delete: true },
    'event-rsvps': { read: true },
    preferences: { read: true },
    translations: { read: true, create: true, update: true, delete: true },
    'admin-schedule': { read: true, create: true, update: true, delete: true },
    'preview-link': { read: true, create: true, update: true, delete: true },
    'admin-edit-lock': { read: true, create: true, update: true, delete: true },
    'admin-pages-tree': { read: true, create: true, update: true, delete: true },
  } as PermissionMatrix,

  viewer: {
    pages: { read: true },
    posts: { read: true },
    media: { read: true },
    'page-templates': { read: true },
    faqs: { read: true },
    events: { read: true },
    redirects: { read: true },
    forms: { read: true },
    'form-submissions': { read: true },
    'field-groups': { read: true },
    'event-rsvps': { read: true },
    preferences: { read: true },
    translations: { read: true },
    'admin-pages-tree': { read: true },
  } as PermissionMatrix,

  customer: {} as PermissionMatrix,
}

/**
 * Check if a user can perform an action on a resource.
 * Admin role always returns true.
 * For others, computes the union of matrices from their roles + custom matrix.
 */
export function can(
  user: { roles?: string[]; id?: number } | null | undefined,
  resource: Resource,
  action: Action,
  customMatrix?: Partial<PermissionMatrix>,
): boolean {
  if (!user) return false

  // Admin always has access
  if (user.roles?.includes('admin')) return true

  // Secret resources always denied for non-admin
  if (SECRET_RESOURCES.includes(resource)) return false

  // Compute effective matrix: union of all role matrices + custom
  const matrices: Partial<PermissionMatrix>[] = []

  if (user.roles) {
    for (const role of user.roles) {
      const roleMatrix = BUILT_IN_ROLES[role]
      if (roleMatrix) {
        matrices.push(roleMatrix)
      }
    }
  }

  if (customMatrix) {
    matrices.push(customMatrix)
  }

  // Any matrix grants the permission = union (OR logic)
  for (const matrix of matrices) {
    const perms = matrix[resource as Resource]
    if (perms?.[action]) return true
  }

  return false
}

/**
 * Check if removing an admin would leave zero admins.
 */
export function canRemoveAdmin(adminCountAfter: number): boolean {
  return adminCountAfter > 0
}

/**
 * Check if a user would lock themselves out by removing their own admin role.
 */
export function wouldLockOutSelf(actingUserId: number | undefined, targetUserId: number | undefined, newRoles: string[]): boolean {
  if (!actingUserId || actingUserId !== targetUserId) return false
  return !newRoles.includes('admin')
}

/**
 * Validate a role change: check last-admin guard, self-lockout guard.
 * Returns {ok: false, reason: string} if denied, {ok: true} if allowed.
 */
export function validateRoleChange({
  actor,
  target,
  newRoles,
  adminCount,
}: {
  actor: { id?: number; roles?: string[] }
  target: { id?: number; roles?: string[] }
  newRoles: string[]
  adminCount: number
}): { ok: boolean; reason?: string } {
  // Last admin guard: cannot demote/remove the last admin
  const isRemovingAdmin = target?.roles?.includes('admin') && !newRoles.includes('admin')
  if (isRemovingAdmin && adminCount === 1) {
    return { ok: false, reason: 'Cannot remove the last admin' }
  }

  // Self-lockout guard: user cannot remove their own admin role
  if (wouldLockOutSelf(actor?.id, target?.id, newRoles)) {
    return { ok: false, reason: 'You cannot remove your own admin role' }
  }

  return { ok: true }
}
