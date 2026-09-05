import React from 'react'
import { Logout } from '@/engine/ui'
import { PREFERENCE_KEYS, formatAdminURL } from '@/engine/shared'
import type { Engine } from '@/engine'

import { AsticoreSaasComingSoon } from '@/components/branding/AsticoreSaasComingSoon'

import {
  AdminNavClient,
  AdminNavDashboardLink,
  AdminNavHamburger,
  AdminNavShell,
  type ResolvedNavEntity,
  type ResolvedNavGroup,
} from './AdminNavClient'
import { readFeatureFlags, resolveEntityGroups } from '@/components/admin/shared/resolveEntities'
import { SettingsRefresh } from '@/components/admin/shared/SettingsRefresh'

const baseClass = 'nav'

// The CMS engine hands nav components a wide set of server props; these are
// the ones this nav actually reads. Typed loosely on purpose so a minor engine
// bump that adds props doesn't break the build.
type I18nLike = { language?: string; t: (key: string) => string }

type AdminNavProps = {
  i18n: I18nLike
  payload: Engine
  permissions?: {
    collections?: Record<string, { read?: boolean } | undefined>
    globals?: Record<string, { read?: boolean } | undefined>
  }
  req?: {
    payload: Engine
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

  // Which entities exist, are permitted and are switched on is decided in one
  // place, shared with the dashboard - see components/admin/shared.
  const flags = await readFeatureFlags(engine)

  const groups: ResolvedNavGroup[] = resolveEntityGroups({
    engine,
    flags,
    i18n,
    permissions,
    visibleEntities,
  })

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
