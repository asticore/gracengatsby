/**
 * Which role slugs a user holds: their built-in roles plus the slug of their custom role. Workflows
 * name roles by slug, so the review routes and the notifier both resolve users through here.
 */

type EngineLike = {
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

const relationId = (value: unknown): number | null => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export type CustomRoleInfo = { slug: string; permissions: Record<string, unknown> | undefined }

/** Slugs for a user row, given the custom roles by id (when the user has one). */
export function roleSlugsFor(user: { roles?: unknown; customRole?: unknown }, customRoles: ReadonlyMap<number, CustomRoleInfo>): string[] {
  const slugs = new Set<string>()
  if (Array.isArray(user.roles)) {
    for (const role of user.roles) if (typeof role === 'string' && role) slugs.add(role)
  }
  const customId = relationId(user.customRole)
  if (customId !== null) {
    const populated = typeof user.customRole === 'object' && user.customRole !== null ? (user.customRole as { slug?: unknown }) : null
    const slug = customRoles.get(customId)?.slug ?? (typeof populated?.slug === 'string' ? populated.slug : '')
    if (slug) slugs.add(slug)
  }
  return [...slugs]
}

/**
 * The role slugs of one user, read from the database. A failed read gives no roles, so a workflow
 * step then admits nobody but admins (fail closed).
 */
export async function roleSlugsOfUser(engine: EngineLike, userId: number): Promise<string[]> {
  try {
    const user = await engine.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    if (!user) return []
    const customId = relationId(user.customRole)
    const customRoles = new Map<number, CustomRoleInfo>()
    if (customId !== null) {
      const role = await engine.findByID({ collection: 'roles', id: customId, depth: 0, overrideAccess: true }).catch((): null => null)
      if (role && typeof role.slug === 'string') customRoles.set(customId, { slug: role.slug, permissions: undefined })
    }
    return roleSlugsFor(user, customRoles)
  } catch {
    return []
  }
}
