import { getAdminRoot } from '@/features/security/settings'
import { adminLabel } from '@/features/uiStrings'
import React from 'react'
import { Logout } from '@/engine/ui'
import { AdminLanguagePicker } from '@/admin/ui/AdminLanguagePicker'
import { PREFERENCE_KEYS, formatAdminURL } from '@/engine/shared'
import type { Engine, TypedUser } from '@/engine'
import { can, type Resource } from '@/features/roles/permissions'

import { AsticoreSaasComingSoon } from '@/components/branding/AsticoreSaasComingSoon'

import {
  AdminNavClient,
  AdminNavDashboardLink,
  AdminNavHamburger,
  AdminNavShell,
  type ResolvedNavGroup,
} from './AdminNavClient'
import { readFeatureFlags, resolveEntityGroups } from '@/components/admin/shared/resolveEntities'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { SettingsRefresh } from '@/components/admin/shared/SettingsRefresh'
import { getMultilingualSettings } from '@/features/multilingual/settings'
import { countItemsNeedingTranslation } from '@/features/multilingual/views/translationsData'

const baseClass = 'nav'

// The CMS engine hands nav components a wide set of server props; these are
// the ones this nav actually reads. Typed loosely on purpose so a minor engine
// bump that adds props doesn't break the build.
type I18nLike = { language?: string; t: (key: string) => string }

type AdminNavProps = {
  i18n: I18nLike
  engine: Engine
  permissions?: {
    collections?: Record<string, { read?: boolean } | undefined>
    globals?: Record<string, { read?: boolean } | undefined>
  }
  req?: {
    engine: Engine
    user?: { collection: string; id: number | string } | null
  }
  visibleEntities: {
    collections: string[]
    globals: string[]
  }
  user?: TypedUser | null
}

type NavPreferences = { groups?: Record<string, { open?: boolean } | undefined> }

/**
 * Filter docs by owner. The preferences `user` field is polymorphic
 * (`relationTo: ['users']`), and the where-builder has no column for
 * `user.relationTo` / `user.value`, so we look up by key and keep only
 * the row that belongs to this user.
 */
function belongsTo(doc: unknown, user: { collection: string; id: number | string }): boolean {
  const owner = (doc as { user?: unknown }).user
  const first = Array.isArray(owner) ? owner[0] : owner
  if (first === null || first === undefined) return false
  const value =
    typeof first === 'object' ? (first as { value?: unknown; id?: unknown }).value ?? (first as { id?: unknown }).id : first
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  return String(id) === String(user.id)
}

/**
 * Reads the signed-in user's saved nav group open/closed state. Equivalent to
 * the CMS engine's internal getNavPrefs, re-implemented because the engine's
 * Next integration does not export it.
 */
async function getNavPreferences(req: AdminNavProps['req']): Promise<NavPreferences | null> {
  if (!req?.user?.collection) return null

  try {
    const result = await req.engine.find({
      collection: 'preferences',
      depth: 0,
      limit: 1000,
      pagination: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req: req as any,
      where: {
        key: { equals: PREFERENCE_KEYS.NAV },
      },
    })

    // Filter by owner since the where-builder cannot map the polymorphic user field
    const mine = (result?.docs ?? []).filter((doc) => belongsTo(doc, req.user))
    return (mine[0]?.value as NavPreferences) || null
  } catch {
    // A missing/unreadable preference should never take the whole admin down -
    // fall back to "no saved state", which means every group starts collapsed.
    return null
  }
}

export const AdminNav: React.FC<AdminNavProps> = async (props) => {
  const { i18n, engine, permissions, req, visibleEntities, user } = props

  if (!engine?.config) return null

  const adminRoute = await getAdminRoot()

  // Which entities exist, are permitted and are switched on is decided in one
  // place, shared with the dashboard - see components/admin/shared.
  const flags = await readFeatureFlags(engine)

  const isAdmin = Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  const canFn = (resource: string, action: 'read' | 'create' | 'update' | 'delete'): boolean => {
    return can(user as unknown as { roles?: string[] }, resource as Resource, action)
  }

  const resolvedGroups = resolveEntityGroups({
    adminRoute,
    engine,
    flags,
    i18n,
    permissions,
    visibleEntities,
    isAdmin,
    can: canFn,
  })
  // Collection and global names follow the admin language. Views keep their own label.
  const ui = await getAdminUi()
  const groups: ResolvedNavGroup[] = resolvedGroups.map((group) => ({
    ...group,
    entities: group.entities.map((entity) => ({
      ...entity,
      label: entity.type === 'globals' ? adminLabel('global', entity.slug, entity.label, ui) : adminLabel('collection', entity.slug, entity.label, ui),
    })),
  }))

  // The Translations badge: how many items still have a language to finish. Only for people who can open the screen.
  const badges: Record<string, number> = {}
  if (canFn('translations', 'read')) {
    const settings = await getMultilingualSettings(engine as never)
    badges.translations = await countItemsNeedingTranslation({ engine: engine as never, user, settings })
  }

  const navPreferences = await getNavPreferences(req)
  const openGroups: Record<string, boolean> = {}
  for (const group of groups) {
    openGroups[group.label] = navPreferences?.groups?.[group.label]?.open ?? false
  }

  return (
    <AdminNavShell>
      <SettingsRefresh />
      <nav className={`${baseClass}__wrap`}>
        <AdminNavDashboardLink href={formatAdminURL({ adminRoute, path: '' })} />
        <AdminNavClient groups={groups} openGroups={openGroups} badges={badges} />
        <AsticoreSaasComingSoon />
        <div className={`${baseClass}__controls`}>
          <AdminLanguagePicker userId={(user as { id?: number | string } | null)?.id} current={(user as { adminLanguage?: string | null } | null)?.adminLanguage} />
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