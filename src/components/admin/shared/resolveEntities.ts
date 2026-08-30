import { cache } from 'react'
import type { Payload, SanitizedCollectionConfig, SanitizedGlobalConfig } from 'payload'
import { formatAdminURL } from 'payload/shared'

import {
  DEFAULT_FLAGS,
  FEATURES,
  isCollectionEnabled,
  isGlobalEnabled,
  type FeatureFlags,
  type FeatureKey,
} from '@/features/registry'

import { FALLBACK_GROUP_LABEL, NAV_STRUCTURE } from '../nav/navStructure'

/**
 * Works out what the signed-in user may see, and how it is grouped.
 *
 * Shared by the sidebar and the dashboard on purpose. Both answer the same
 * question - which collections and globals exist, are permitted, and are
 * switched on - and when each answered it separately they drifted: a feature
 * toggled off vanished from the sidebar but kept a card on the dashboard.
 * One resolver, one answer.
 */

export type ResolvedEntity = {
  slug: string
  type: 'collections' | 'globals'
  label: string
  /** Singular label, for "New <thing>" style actions. Same as `label` for globals. */
  singular: string
  href: string
  /** Where "add new" goes, when the user may create one. Globals never can. */
  createHref: string | null
  id: string
}

export type ResolvedGroup = {
  label: string
  entities: ResolvedEntity[]
}

export type EntityPermissions = {
  collections?: Record<string, { create?: boolean; read?: boolean } | undefined>
  globals?: Record<string, { read?: boolean } | undefined>
}

export type VisibleEntitiesLike = {
  collections: string[]
  globals: string[]
}

/**
 * Only the two fields label resolution needs. `t` is typed as accepting any
 * string rather than the engine's union of known translation keys, because
 * label functions are handed the whole i18n context and this never calls `t`
 * itself - it only passes it through.
 */
type I18nLike = { language?: string; t: (key: never) => string }

/**
 * Reads the feature flags from Site Settings using an engine client the caller
 * already has. Never throws: settings may be unreadable before the first
 * migration, and that should degrade to defaults rather than blank the admin.
 *
 * Memoised per request because the sidebar and the dashboard both need the
 * flags and both render in the same pass, which otherwise means reading the
 * same global twice - two D1 round trips for one answer. Keyed on the engine
 * instance, which is a per-request singleton, so a miss only costs the query
 * that would have run anyway.
 */
export const readFeatureFlags = cache(async (engine: Payload): Promise<FeatureFlags> => {
  const flags: FeatureFlags = { ...DEFAULT_FLAGS }
  try {
    const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 })
    const saved = (settings?.features ?? {}) as Partial<Record<FeatureKey, boolean | null>>
    for (const feature of FEATURES) {
      flags[feature.key] = saved[feature.key] ?? feature.defaultEnabled
    }
  } catch {
    // Defaults it is.
  }
  return flags
})

/**
 * Labels come in three shapes - a plain string, a locale-keyed record, or a
 * function of the i18n context. Resolve all three to a display string, falling
 * back to the slug so an entity always reads as something.
 */
function resolveLabel(
  raw: unknown,
  i18n: I18nLike,
  fallback: string,
): string {
  const value = typeof raw === 'function' ? (raw as (args: unknown) => unknown)({ i18n, t: i18n.t }) : raw

  if (typeof value === 'string') return value

  if (value && typeof value === 'object') {
    const record = value as Record<string, string>
    return record[i18n.language || 'en'] || record.en || Object.values(record)[0] || fallback
  }

  return fallback
}

export type ResolveArgs = {
  engine: Payload
  flags: FeatureFlags
  i18n: I18nLike
  permissions?: EntityPermissions
  visibleEntities: VisibleEntitiesLike
}

/**
 * Groups every permitted, enabled entity per NAV_STRUCTURE, in that order.
 * Anything not named there lands in a trailing group, so a newly added
 * collection is never silently invisible.
 */
export function resolveEntityGroups(args: ResolveArgs): ResolvedGroup[] {
  const { engine, flags, i18n, permissions, visibleEntities } = args

  if (!engine?.config) return []

  const adminRoute = engine.config.routes.admin
  const available = new Map<string, ResolvedEntity>()

  for (const collection of engine.config.collections as SanitizedCollectionConfig[]) {
    if (!visibleEntities.collections.includes(collection.slug)) continue
    if (collection.admin?.group === false) continue
    if (!permissions?.collections?.[collection.slug]?.read) continue
    if (!isCollectionEnabled(collection.slug, flags)) continue

    const href = formatAdminURL({ adminRoute, path: `/collections/${collection.slug}` })

    available.set(`collections:${collection.slug}`, {
      slug: collection.slug,
      type: 'collections',
      label: resolveLabel(collection.labels?.plural, i18n, collection.slug),
      singular: resolveLabel(collection.labels?.singular, i18n, collection.slug),
      href,
      createHref: permissions?.collections?.[collection.slug]?.create ? `${href}/create` : null,
      id: `nav-${collection.slug}`,
    })
  }

  for (const global of engine.config.globals as SanitizedGlobalConfig[]) {
    if (!visibleEntities.globals.includes(global.slug)) continue
    if (global.admin?.group === false) continue
    if (!permissions?.globals?.[global.slug]?.read) continue
    if (!isGlobalEnabled(global.slug, flags)) continue

    const label = resolveLabel(global.label, i18n, global.slug)

    available.set(`globals:${global.slug}`, {
      slug: global.slug,
      type: 'globals',
      label,
      singular: label,
      href: formatAdminURL({ adminRoute, path: `/globals/${global.slug}` }),
      // A global is a single document - there is nothing to create.
      createHref: null,
      id: `nav-global-${global.slug}`,
    })
  }

  const groups: ResolvedGroup[] = []
  const claimed = new Set<string>()

  for (const groupDef of NAV_STRUCTURE) {
    const entities: ResolvedEntity[] = []
    for (const ref of groupDef.entities) {
      // A custom screen has no collection or global behind it, so there is
      // nothing to look up and no read permission to check - reaching the
      // admin at all is the permission. Its label and path come from the nav
      // structure itself.
      if (ref.type === 'view') {
        if (!ref.href) continue
        entities.push({
          slug: ref.slug,
          type: 'collections',
          label: ref.label || ref.slug,
          singular: ref.label || ref.slug,
          href: formatAdminURL({ adminRoute, path: ref.href as `/${string}` }),
          createHref: null,
          id: `nav-view-${ref.slug}`,
        })
        continue
      }

      const key = `${ref.type}:${ref.slug}`
      const entity = available.get(key)
      if (!entity) continue
      entities.push(entity)
      claimed.add(key)
    }
    if (entities.length > 0) groups.push({ label: groupDef.label, entities })
  }

  const leftovers = [...available.entries()]
    .filter(([key]) => !claimed.has(key))
    .map(([, entity]) => entity)

  if (leftovers.length > 0) groups.push({ label: FALLBACK_GROUP_LABEL, entities: leftovers })

  return groups
}
