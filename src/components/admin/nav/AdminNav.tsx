import React from 'react'
import { Logout } from '@payloadcms/ui'
import { PREFERENCE_KEYS, formatAdminURL } from 'payload/shared'
import type { Payload, SanitizedCollectionConfig, SanitizedGlobalConfig } from 'payload'

import { AsticoreSaasComingSoon } from '@/components/branding/AsticoreSaasComingSoon'

import {
  AdminNavClient,
  AdminNavDashboardLink,
  AdminNavHamburger,
  AdminNavShell,
  type ResolvedNavEntity,
  type ResolvedNavGroup,
} from './AdminNavClient'
import { FALLBACK_GROUP_LABEL, NAV_STRUCTURE } from './navStructure'
import { DEFAULT_FLAGS, FEATURES, isCollectionEnabled, isGlobalEnabled, type FeatureFlags, type FeatureKey } from '@/features/registry'

const baseClass = 'nav'

// The CMS engine hands nav components a wide set of server props; these are
// the ones this nav actually reads. Typed loosely on purpose so a minor engine
// bump that adds props doesn't break the build.
type I18nLike = { language?: string; t: (key: string) => string }

type AdminNavProps = {
  i18n: I18nLike
  payload: Payload
  permissions?: {
    collections?: Record<string, { read?: boolean } | undefined>
    globals?: Record<string, { read?: boolean } | undefined>
  }
  req?: {
    payload: Payload
    user?: { collection: string; id: number | string } | null
  }
  visibleEntities: {
    collections: string[]
    globals: string[]
  }
}

type NavPreferences = { groups?: Record<string, { open?: boolean } | undefined> }

/**
 * Reads the signed-in user's saved nav group open/closed state. Equivalent to
 * the CMS engine's internal getNavPrefs, re-implemented because the engine's
 * Next integration does not export it.
 */
async function getNavPreferences(req: AdminNavProps['req']): Promise<NavPreferences | null> {
  if (!req?.user?.collection) return null

  try {
    const result = await req.payload.find({
      collection: 'payload-preferences',
      depth: 0,
      limit: 1,
      pagination: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req: req as any,
      where: {
        and: [
          { key: { equals: PREFERENCE_KEYS.NAV } },
          { 'user.relationTo': { equals: req.user.collection } },
          { 'user.value': { equals: req.user.id } },
        ],
      },
    })
    return (result?.docs?.[0]?.value as NavPreferences) || null
  } catch {
    // A missing/unreadable preference should never take the whole admin down -
    // fall back to "no saved state", which means every group starts collapsed.
    return null
  }
}

export const AdminNav: React.FC<AdminNavProps> = async (props) => {
  const { i18n, payload: engine, permissions, req, visibleEntities } = props

  if (!engine?.config) return null

  const adminRoute = engine.config.routes.admin

  // Feature flags decide which collections/globals appear at all. Read straight
  // from Site Settings rather than the helper in utilities/features, which
  // builds its own engine client - here we already have one.
  const flags: FeatureFlags = { ...DEFAULT_FLAGS }
  try {
    const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 })
    const saved = (settings?.features ?? {}) as Partial<Record<FeatureKey, boolean | null>>
    for (const feature of FEATURES) {
      flags[feature.key] = saved[feature.key] ?? feature.defaultEnabled
    }
  } catch {
    // Settings unreadable (e.g. before the first migration) - fall back to
    // defaults so the sidebar still renders rather than blanking the admin.
  }

  // Labels can be a plain string, a locale-keyed record, or a function of the
  // i18n context. Resolve all three down to a display string, falling back to
  // the slug so an entity always has something readable in the sidebar.
  const resolveLabel = (entity: SanitizedCollectionConfig | SanitizedGlobalConfig): string => {
    const raw: unknown = 'labels' in entity ? entity.labels?.plural : (entity as SanitizedGlobalConfig).label

    const value = typeof raw === 'function' ? (raw as (args: unknown) => unknown)({ i18n, t: i18n.t }) : raw

    if (typeof value === 'string') return value

    if (value && typeof value === 'object') {
      const record = value as Record<string, string>
      return record[i18n.language || 'en'] || record.en || Object.values(record)[0] || entity.slug
    }

    return entity.slug
  }

  // Index every entity the current user is allowed to see, keyed "type:slug".
  const available = new Map<string, ResolvedNavEntity>()

  for (const collection of engine.config.collections) {
    if (!visibleEntities.collections.includes(collection.slug)) continue
    if (collection.admin?.group === false) continue
    if (!permissions?.collections?.[collection.slug]?.read) continue
    if (!isCollectionEnabled(collection.slug, flags)) continue
    available.set(`collections:${collection.slug}`, {
      slug: collection.slug,
      label: resolveLabel(collection),
      href: formatAdminURL({ adminRoute, path: `/collections/${collection.slug}` }),
      id: `nav-${collection.slug}`,
    })
  }

  for (const global of engine.config.globals) {
    if (!visibleEntities.globals.includes(global.slug)) continue
    if (global.admin?.group === false) continue
    if (!permissions?.globals?.[global.slug]?.read) continue
    if (!isGlobalEnabled(global.slug, flags)) continue
    available.set(`globals:${global.slug}`, {
      slug: global.slug,
      label: resolveLabel(global),
      href: formatAdminURL({ adminRoute, path: `/globals/${global.slug}` }),
      id: `nav-global-${global.slug}`,
    })
  }

  // Build the declared groups in declared order, then sweep anything left over
  // into a trailing group so a new collection is never invisible.
  const groups: ResolvedNavGroup[] = []
  const claimed = new Set<string>()

  for (const groupDef of NAV_STRUCTURE) {
    const entities: ResolvedNavEntity[] = []
    for (const ref of groupDef.entities) {
      const key = `${ref.type}:${ref.slug}`
      const entity = available.get(key)
      if (!entity) continue
      entities.push(entity)
      claimed.add(key)
    }
    if (entities.length > 0) groups.push({ label: groupDef.label, entities })
  }

  const leftovers = [...available.entries()].filter(([key]) => !claimed.has(key)).map(([, entity]) => entity)
  if (leftovers.length > 0) groups.push({ label: FALLBACK_GROUP_LABEL, entities: leftovers })

  const navPreferences = await getNavPreferences(req)
  const openGroups: Record<string, boolean> = {}
  for (const group of groups) {
    openGroups[group.label] = navPreferences?.groups?.[group.label]?.open ?? false
  }

  return (
    <AdminNavShell>
      <nav className={`${baseClass}__wrap`}>
        <AdminNavDashboardLink href={formatAdminURL({ adminRoute, path: '' })} />
        <AdminNavClient groups={groups} openGroups={openGroups} />
        <AsticoreSaasComingSoon />
        <div className={`${baseClass}__controls`}>
          <Logout />
        </div>
      </nav>
      <div className={`${baseClass}__header`}>
        <div className={`${baseClass}__header-content`}>
          <AdminNavHamburger />
        </div>
      </div>
    </AdminNavShell>
  )
}

export default AdminNav
