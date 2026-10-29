/**
 * Pure permissions logic for role-based access control.
 * No database imports - this is purely for computing user capabilities.
 */

export const RESOURCES = [
  'pages',
  'posts',
  'media',
  'products',
  'product-attributes',
  'shipping-classes',
  'product-reviews',
  'stock-subscriptions',
  'product-subscriptions',
  'gift-cards',
  'store-credits',
  'credit-ledger',
  'shipping-manifests',
  'orders',
  'order-refunds',
  'coupons',
  'shipping-zones',
  'tax-rates',
  'events',
  'forms',
  'forms.export',
  'forms.integrations',
  'redirects',
  'users',
  'roles',
  'faqs',
  'field-groups',
  'data-views',
  'event-rsvps',
  'page-templates',
  'reusable-sections',
  'site-templates',
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
  'ad-units',
  'ad-placements',
  'ad-reports',
  'settings:ad-settings',
  'audit-log',
  'email-log',
  'error-log',
  'backups',
  'translations',
  'form-submissions',
  'locked-documents',
  'settings:site-settings',
  'settings:site-pages',
  'settings:site-details',
  'settings:blog-settings',
  'settings:faq-settings',
  'settings:form-settings',
  'settings:email-settings',
  'settings:email-templates',
  'settings:email-brand',
  'settings:email-schedule',
  'settings:google-connection',
  'settings:media-settings',
  'settings:member-settings',
  'settings:payment-settings',
  'settings:shipping-settings',
  'settings:shop-settings',
  'settings:shop-extra-settings',
  'settings:seo-settings',
  'settings:language-settings',
  'settings:domain-settings',
  'domains',
  'settings:backup-settings',
  'settings:speed-settings',
  'settings:security-settings',
  'settings:integrations',
  'versions.delete',
  'admin-schedule',
  'admin-pagespeed',
  'admin-visibility-password',
  'admin-edit-lock',
  'preview-link',
  'admin-version-delete',
  'admin-pages-tree',
  'content.editStyle',
  'content.editLayout',
  'content.editSeo',
  'versions.restore',
  'cache.purge',
  'redirects.import',
  'review',
  'locks',
] as const

export type Resource = (typeof RESOURCES)[number]
export type Action = 'read' | 'create' | 'update' | 'delete' | 'publish'

export const ACTIONS: Action[] = ['read', 'create', 'update', 'delete']
export const ALL_ACTIONS: Action[] = [...ACTIONS, 'publish']

/** 'own' limits read/update/delete to documents the user created (custom role matrices only). */
export type Scope = 'all' | 'own'

export type ResourcePermissions = Partial<Record<Action, boolean>> & { scope?: Scope }

export type PermissionMatrix = Record<Resource, ResourcePermissions>

/** Collections that carry createdBy (src/fields/authorship.ts), so an "own items only" scope can be enforced. */
export const OWNABLE_RESOURCES: readonly Resource[] = ['pages', 'posts', 'events', 'products', 'courses']

export const SCOPED_ACTIONS: readonly Action[] = ['read', 'update', 'delete']

export type PermissionOverrides = {
  grant?: Partial<PermissionMatrix>
  deny?: Partial<PermissionMatrix>
}

/**
 * Resources that should ALWAYS be denied to non-admins, even if a custom
 * matrix explicitly grants permission.
 */
export const SECRET_RESOURCES: Resource[] = [
  'settings:integrations',
  'settings:google-connection',
  'forms.integrations',
  'settings:security-settings',
  'settings:payment-settings',
  'settings:shipping-settings',
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
        ...(r === 'admin-version-delete' || r === 'versions.delete' ? { delete: true } : {}),
        ...(r === 'preview-link' ? { create: true } : {}),
        ...(r === 'admin-schedule' ? { update: true } : {}),
        ...(r === 'versions.restore' || r === 'content.editStyle' || r === 'content.editLayout' || r === 'content.editSeo' || r === 'cache.purge' || r === 'redirects.import' ? { update: true } : {}),
        ...(['pages', 'posts', 'events', 'products', 'courses', 'review', 'forms'].includes(r) ? { publish: true } : {}),
      },
    ]),
  ) as PermissionMatrix,

  editor: {
    pages: { read: true, create: true, update: true, delete: true, publish: true },
    posts: { read: true, create: true, update: true, delete: true, publish: true },
    media: { read: true, create: true, update: true, delete: true },
    'page-templates': { read: true, create: true, update: true, delete: true },
    'reusable-sections': { read: true, create: true, update: true, delete: true },
    'site-templates': { read: true, create: true, update: true, delete: true },
    faqs: { read: true, create: true, update: true, delete: true },
    events: { read: true, create: true, update: true, delete: true, publish: true },
    redirects: { read: true, create: true, update: true, delete: true },
    forms: { read: true, create: true, update: true, delete: true, publish: true },
    'form-submissions': { read: true, update: true },
    'field-groups': { read: true, create: true, update: true, delete: true },
    'data-views': { read: true, create: true, update: true, delete: true },
    'event-rsvps': { read: true },
    preferences: { read: true },
    translations: { read: true, create: true, update: true, delete: true },
    'admin-schedule': { read: true, create: true, update: true, delete: true },
    'admin-pagespeed': { read: true, update: true },
    'preview-link': { read: true, create: true, update: true, delete: true },
    'admin-edit-lock': { read: true, create: true, update: true, delete: true },
    'admin-pages-tree': { read: true, create: true, update: true, delete: true },
    'content.editStyle': { update: true },
    'content.editLayout': { update: true },
    'content.editSeo': { update: true },
    'versions.restore': { update: true },
    'cache.purge': { update: true },
    'redirects.import': { update: true },
    // Editors send their work for review and comment on it. Approving needs review.publish.
    review: { read: true, update: true },
  } as PermissionMatrix,

  viewer: {
    pages: { read: true },
    posts: { read: true },
    media: { read: true },
    'page-templates': { read: true },
    'reusable-sections': { read: true },
    'site-templates': { read: true },
    faqs: { read: true },
    events: { read: true },
    redirects: { read: true },
    forms: { read: true },
    'form-submissions': { read: true },
    'field-groups': { read: true },
    'data-views': { read: true },
    'event-rsvps': { read: true },
    preferences: { read: true },
    translations: { read: true },
    'admin-pages-tree': { read: true },
    review: { read: true },
  } as PermissionMatrix,

  customer: {} as PermissionMatrix,
}

/**
 * Check if a user can perform an action on a resource.
 * Admin role always returns true.
 * For others, computes the union of matrices from their roles + custom matrix + overrides.
 * Deny overrides always take precedence.
 */
export function can(
  user: PermissionUser | null | undefined,
  resource: Resource,
  action: Action,
  customMatrix?: Partial<PermissionMatrix>,
): boolean {
  return resolveAccess(user, resource, action, customMatrix) !== false
}

/**
 * Same union as can(), but says how far the grant reaches: 'all' (every document) or 'own' (only
 * documents the user created). 'own' only ever comes from a custom role matrix, and only when no
 * built-in role, grant override or other source grants the action without the limit.
 */
export function resolveAccess(
  user: PermissionUser | null | undefined,
  resource: Resource,
  action: Action,
  customMatrix?: Partial<PermissionMatrix>,
): false | Scope {
  if (!user) return false

  // Admin always has access
  if (user.roles?.includes('admin')) return 'all'

  // Secret resources always denied for non-admin
  if (SECRET_RESOURCES.includes(resource)) return false

  // Parse permission overrides
  const overrides = parsePermissionOverrides(user.permissionOverrides)

  // Check deny override first - deny beats everything
  if (overrides.deny?.[resource as Resource]?.[action]) return false

  // Compute effective matrix: union of all role matrices + custom + overrides
  const matrices: Partial<PermissionMatrix>[] = []

  if (user.roles) {
    for (const role of user.roles) {
      const roleMatrix = BUILT_IN_ROLES[role]
      if (roleMatrix) {
        matrices.push(roleMatrix)
      }
    }
  }

  // The matrix the session carries (loaded once per request, see customRoleCache.ts) unless the caller
  // passes one. A user whose custom role could not be loaded carries an empty matrix: no custom grants.
  const custom = customMatrix ?? parseCustomMatrix(user.customRolePermissions)
  if (custom) {
    matrices.push(custom)
  }

  // Add grant overrides to the union
  const grant = overrides.grant
  if (grant) {
    matrices.push(grant)
  }

  // Any matrix grants the permission = union (OR logic). Only the custom matrix can narrow the grant to
  // the user's own documents; a grant from anywhere else is unrestricted.
  let narrowed = false
  for (const matrix of matrices) {
    const perms = matrix[resource as Resource]
    if (!perms?.[action]) continue
    if (matrix === custom && perms.scope === 'own' && SCOPED_ACTIONS.includes(action)) {
      narrowed = true
      continue
    }
    return 'all'
  }

  return narrowed ? 'own' : false
}

/** Type of the user object that can() reads: built-in roles, per-user overrides and the session's custom role matrix. */
export type PermissionUser = {
  roles?: string[]
  id?: number
  permissionOverrides?: string | PermissionOverrides | null
  customRolePermissions?: unknown
}

/** A matrix from a session or a role row, or undefined when it is not a plain object (fail closed). */
export function parseCustomMatrix(input: unknown): Partial<PermissionMatrix> | undefined {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Partial<PermissionMatrix>
}

/**
 * Safely parse PermissionOverrides from user object, handling string/object/null/invalid cases.
 */
function parsePermissionOverrides(input: string | PermissionOverrides | null | undefined): PermissionOverrides {
  if (!input) return {}
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed
      }
    } catch {
      // Invalid JSON, return empty
    }
    return {}
  }
  if (typeof input === 'object') {
    return input
  }
  return {}
}

/**
 * Compute the effective permission matrix for a user (for UI display).
 * Returns the full computed matrix considering roles, custom matrix, and overrides.
 */
export function effectiveMatrix(
  user: PermissionUser | null | undefined,
  customMatrix?: Partial<PermissionMatrix>,
): PermissionMatrix {
  const result: PermissionMatrix = {} as PermissionMatrix

  // Start with all resources
  for (const resource of RESOURCES) {
    result[resource as Resource] = {}
  }

  if (!user) return result

  // Admin has everything (except secret operations default to false for safety, but admin checks bypass)
  if (user.roles?.includes('admin')) {
    for (const resource of RESOURCES) {
      result[resource as Resource] = {
        read: true,
        create: true,
        update: true,
        delete: true,
        ...(resource === 'admin-version-delete' || resource === 'versions.delete' ? { delete: true } : {}),
        ...(resource === 'preview-link' ? { create: true } : {}),
        ...(resource === 'admin-schedule' ? { update: true } : {}),
        ...(['pages', 'posts', 'events', 'products', 'courses', 'review'].includes(resource) ? { publish: true } : {}),
      }
    }
    return result
  }

  // Non-admin: union of role matrices + custom matrix + grant overrides, minus deny overrides
  const matrices: Partial<PermissionMatrix>[] = []

  if (user.roles) {
    for (const role of user.roles) {
      const roleMatrix = BUILT_IN_ROLES[role]
      if (roleMatrix) {
        matrices.push(roleMatrix)
      }
    }
  }

  const custom = customMatrix ?? parseCustomMatrix(user.customRolePermissions)
  if (custom) {
    matrices.push(custom)
  }

  const overrides = parsePermissionOverrides(user.permissionOverrides)
  if (overrides.grant) {
    matrices.push(overrides.grant)
  }

  // Compute union
  for (const resource of RESOURCES) {
    const resActions: Partial<Record<Action, boolean>> = {}
    for (const action of ALL_ACTIONS) {
      let granted = false
      for (const matrix of matrices) {
        if (matrix[resource as Resource]?.[action]) {
          granted = true
          break
        }
      }
      // Apply deny override
      if (granted && overrides.deny?.[resource as Resource]?.[action]) {
        granted = false
      }
      if (granted) {
        resActions[action] = true
      }
    }
    result[resource as Resource] = resActions
  }

  return result
}

/**
 * Sanitize permission overrides: drop unknown resources/actions, drop secret resources from grants, validate booleans.
 */
export function sanitizeOverrides(input: unknown): PermissionOverrides {
  if (!input) return {}
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch {
      return {}
    }
  }

  if (typeof input !== 'object' || input === null) {
    return {}
  }

  const obj = input as any
  const sanitized: PermissionOverrides = {}

  // Process grant
  if (obj.grant && typeof obj.grant === 'object') {
    const grant: Partial<PermissionMatrix> = {}
    for (const [resource, perms] of Object.entries(obj.grant) as [string, any][]) {
      if (!RESOURCES.includes(resource as Resource)) continue
      // Don't allow granting secret resources
      if (SECRET_RESOURCES.includes(resource as Resource)) continue

      const sanitizedPerms: Partial<Record<Action, boolean>> = {}
      if (typeof perms === 'object' && perms !== null) {
        for (const [action, value] of Object.entries(perms) as [string, any][]) {
          if (!ALL_ACTIONS.includes(action as Action)) continue
          if (typeof value === 'boolean') {
            sanitizedPerms[action as Action] = value
          }
        }
      }
      if (Object.keys(sanitizedPerms).length > 0) {
        grant[resource as Resource] = sanitizedPerms
      }
    }
    if (Object.keys(grant).length > 0) {
      sanitized.grant = grant
    }
  }

  // Process deny
  if (obj.deny && typeof obj.deny === 'object') {
    const deny: Partial<PermissionMatrix> = {}
    for (const [resource, perms] of Object.entries(obj.deny) as [string, any][]) {
      if (!RESOURCES.includes(resource as Resource)) continue

      const sanitizedPerms: Partial<Record<Action, boolean>> = {}
      if (typeof perms === 'object' && perms !== null) {
        for (const [action, value] of Object.entries(perms) as [string, any][]) {
          if (!ALL_ACTIONS.includes(action as Action)) continue
          if (typeof value === 'boolean') {
            sanitizedPerms[action as Action] = value
          }
        }
      }
      if (Object.keys(sanitizedPerms).length > 0) {
        deny[resource as Resource] = sanitizedPerms
      }
    }
    if (Object.keys(deny).length > 0) {
      sanitized.deny = deny
    }
  }

  return sanitized
}

/**
 * Permission categories for UI display.
 * Groups every resource exactly once with applicable actions.
 */
export const PERMISSION_CATEGORIES: Array<{
  id: string
  label: string
  rows: Array<{
    resource: Resource
    label: string
    description?: string
    actions: Action[]
  }>
}> = [
  {
    id: 'content',
    label: 'Content',
    rows: [
      { resource: 'pages', label: 'Pages', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'posts', label: 'Blog', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'events', label: 'Events', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'faqs', label: 'FAQs', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'page-templates', label: 'Page templates', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'site-templates', label: 'Site templates', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'reusable-sections', label: 'Reusable sections', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'field-groups', label: 'Field groups', actions: ['read', 'create', 'update', 'delete'] },
      {
        resource: 'data-views',
        label: 'Tables and charts',
        description: 'Build tables and charts from site content or a spreadsheet. A view can read the fields of pages, posts, products, events and FAQs that you allow, so grant Create and Update to people you trust with that data.',
        actions: ['read', 'create', 'update', 'delete'],
      },
      { resource: 'forms', label: 'Forms', description: 'Publish: make a form live or take it down. Webhooks and which websites may embed a form are admin-only.', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'forms.export', label: 'Form entries: download CSV', actions: ['read'] },
      { resource: 'forms.integrations', label: 'Form webhooks and embed websites', description: 'Always administrators only.', actions: ['update'] },
      { resource: 'form-submissions', label: 'Form submissions', description: 'Update: change status, assignee and notes.', actions: ['read', 'update', 'delete'] },
      { resource: 'redirects', label: 'Redirects', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'translations', label: 'Translations', actions: ['read', 'create', 'update', 'delete'] },
      {
        resource: 'review',
        label: 'Content review',
        description: 'Read: see the review queue and history. Update: submit for review and comment. Publish: approve, request changes, and publish approved content.',
        actions: ['read', 'update', 'publish'],
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    rows: [{ resource: 'media', label: 'Media', actions: ['read', 'create', 'update', 'delete'] }],
  },
  {
    id: 'shop',
    label: 'Shop',
    rows: [
      { resource: 'products', label: 'Products', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'product-attributes', label: 'Product attributes', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'shipping-classes', label: 'Shipping classes', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'product-reviews', label: 'Product reviews', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'stock-subscriptions', label: 'Back-in-stock sign-ups', description: 'Read: see who is waiting. Delete: remove a sign-up.', actions: ['read', 'delete'] },
      { resource: 'product-subscriptions', label: 'Product subscriptions', description: 'Read: see subscribers. Update: pause, resume or cancel. Delete: remove a record.', actions: ['read', 'update', 'delete'] },
      { resource: 'gift-cards', label: 'Gift cards', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'store-credits', label: 'Store credit balances', description: 'Update: add or deduct store credit.', actions: ['read', 'update'] },
      { resource: 'credit-ledger', label: 'Credit ledger', actions: ['read'] },
      { resource: 'shipping-manifests', label: 'Shipping manifests', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'orders', label: 'Orders', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'order-refunds', label: 'Order refunds', description: 'Create: issue a refund. Read: see refund history.', actions: ['read', 'create'] },
      { resource: 'coupons', label: 'Coupons', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'shipping-zones', label: 'Shipping zones', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'tax-rates', label: 'Tax rates', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'carts', label: 'Carts', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'transactions', label: 'Transactions', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'addresses', label: 'Addresses', actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
  {
    id: 'members',
    label: 'Members and courses',
    rows: [
      { resource: 'memberships', label: 'Memberships', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'membership-tiers', label: 'Membership tiers', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'courses', label: 'Courses', actions: ['read', 'create', 'update', 'delete', 'publish'] },
      { resource: 'lessons', label: 'Lessons', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'enrolments', label: 'Enrolments', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'lesson-progress', label: 'Lesson progress', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'event-rsvps', label: 'Event RSVPs', actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    rows: [{ resource: 'ab-tests', label: 'A/B tests', actions: ['read', 'create', 'update', 'delete'] }],
  },
  {
    id: 'ads',
    label: 'Ads',
    rows: [
      { resource: 'ad-units', label: 'Ad units', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'ad-placements', label: 'Ad placements', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'ad-reports', label: 'Ad reports', actions: ['read'] },
      {
        resource: 'settings:ad-settings',
        label: 'Ads settings (admin-equivalent)',
        description: 'Update can load third-party ad scripts on every page of the site, so grant it only to people you would trust with admin access.',
        actions: ['read', 'update'],
      },
    ],
  },
  {
    id: 'editing',
    label: 'Editing rights',
    rows: [
      { resource: 'content.editStyle', label: 'Edit block styles', actions: ['update'] },
      { resource: 'content.editLayout', label: 'Edit block layout', actions: ['update'] },
      { resource: 'content.editSeo', label: 'Edit SEO settings', actions: ['update'] },
      { resource: 'versions.restore', label: 'Restore versions', actions: ['update'] },
      { resource: 'versions.delete', label: 'Delete versions', actions: ['delete'] },
      { resource: 'admin-version-delete', label: 'Admin version delete', actions: ['delete'] },
      { resource: 'admin-schedule', label: 'Schedule publish', actions: ['update'] },
      {
        resource: 'admin-pagespeed',
        label: 'PageSpeed tests',
        description: 'View PageSpeed results, and run new tests (each uses part of the site\'s Google allowance).',
        actions: ['read', 'update'],
      },
      { resource: 'admin-visibility-password', label: 'Password protect', actions: ['update'] },
      { resource: 'admin-edit-lock', label: 'Lock document', actions: ['update'] },
      {
        resource: 'locks',
        label: 'Manage section locks',
        description: 'Lock or unlock sections, templates and pages. Roles named on a lock may always edit it.',
        actions: ['update'],
      },
      { resource: 'preview-link', label: 'Preview link', actions: ['create'] },
      { resource: 'admin-pages-tree', label: 'Pages tree', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'cache.purge', label: 'Purge cache', actions: ['update'] },
      { resource: 'redirects.import', label: 'Import redirects', actions: ['update'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    rows: [
      { resource: 'settings:site-settings', label: 'Site settings', actions: ['read', 'update'] },
      { resource: 'settings:site-pages', label: 'Site pages and maintenance', actions: ['read', 'update'] },
      { resource: 'settings:site-details', label: 'Site details', actions: ['read', 'update'] },
      { resource: 'settings:blog-settings', label: 'Blog settings', actions: ['read', 'update'] },
      { resource: 'settings:faq-settings', label: 'FAQ settings', actions: ['read', 'update'] },
      { resource: 'settings:form-settings', label: 'Form settings', actions: ['read', 'update'] },
      { resource: 'settings:email-settings', label: 'Email settings', actions: ['read', 'update'] },
      { resource: 'settings:email-templates', label: 'Email templates', actions: ['read', 'update'] },
      { resource: 'settings:email-brand', label: 'Email design', actions: ['read', 'update'] },
      { resource: 'settings:email-schedule', label: 'When emails are sent', actions: ['read', 'update'] },
      { resource: 'settings:google-connection', label: 'Google connection', description: 'Always administrators only.', actions: ['read', 'update'] },
      { resource: 'settings:media-settings', label: 'Media settings', actions: ['read', 'update'] },
      { resource: 'settings:member-settings', label: 'Member settings', actions: ['read', 'update'] },
      { resource: 'settings:payment-settings', label: 'Payment settings', actions: ['read', 'update'] },
      { resource: 'settings:shipping-settings', label: 'Shipping carrier settings', actions: ['read', 'update'] },
      { resource: 'settings:shop-settings', label: 'Shop settings', actions: ['read', 'update'] },
      { resource: 'settings:shop-extra-settings', label: 'Shop switches', actions: ['read', 'update'] },
      { resource: 'settings:seo-settings', label: 'SEO settings', actions: ['read', 'update'] },
      { resource: 'settings:language-settings', label: 'Language settings', actions: ['read', 'update'] },
      { resource: 'settings:domain-settings', label: 'Domains', actions: ['read', 'update'] },
      { resource: 'settings:backup-settings', label: 'Backup settings', actions: ['read', 'update'] },
      { resource: 'settings:speed-settings', label: 'Speed settings', actions: ['read', 'update'] },
      { resource: 'settings:security-settings', label: 'Security settings', actions: ['read', 'update'] },
      { resource: 'settings:integrations', label: 'Integrations', actions: ['read', 'update'] },
    ],
  },
  {
    id: 'users',
    label: 'Users and access',
    rows: [
      { resource: 'users', label: 'Users', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'domains', label: 'Domain access (Allowed domains on users)', description: 'Change which domains an account may work on.', actions: ['read', 'update'] },
      { resource: 'roles', label: 'Roles', actions: ['read', 'create', 'update', 'delete'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    rows: [
      { resource: 'audit-log', label: 'Audit log', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'email-log', label: 'Email log', actions: ['read', 'delete'] },
      { resource: 'error-log', label: 'Error log', actions: ['read', 'update', 'delete'] },
      { resource: 'backups', label: 'Backups', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'locked-documents', label: 'Locked documents', actions: ['read', 'create', 'update', 'delete'] },
      { resource: 'preferences', label: 'Preferences', actions: ['read', 'update'] },
    ],
  },
]

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
