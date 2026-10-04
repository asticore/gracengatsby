import React from 'react'
import type { AdminViewServerProps } from '@/engine'
import { formatAdminURL } from '@/engine/shared'
import {
  readFeatureFlags,
  resolveEntityGroups,
  type ResolvedEntity,
} from '@/components/admin/shared/resolveEntities'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'
import { SETTINGS_DESCRIPTIONS } from '@/components/admin/nav/settingsDescriptions'
import { SettingsOverviewSearch, type SettingsGroup } from './SettingsOverviewClient'

/**
 * The Settings overview page at /admin/settings.
 *
 * Shows all settings grouped by category (Site, Marketing and SEO, etc.) with
 * one-line descriptions and a search box. Server component that resolves entities
 * like the sidebar and dashboard.
 */
export const SettingsOverviewView: React.FC<AdminViewServerProps> = async (props) => {
  const { i18n, engine: realEngine, permissions, visibleEntities } = props

  if (!realEngine?.config) return null

  // Cast to our Engine type as we do in Dashboard and AdminNav
  const engine = realEngine as unknown as any

  const adminRoute = engine.config.routes.admin
  const flags = await readFeatureFlags(engine)

  // Get all resolved entities
  const allGroups = resolveEntityGroups({
    engine,
    flags,
    i18n,
    permissions,
    visibleEntities,
  })

  // Map resolved entities back to navStructure groups that are Settings-related
  const settingsGroupLabels = new Set([
    'Site',
    'Marketing and SEO',
    'Content settings',
    'Commerce settings',
    'Communication',
    'Speed and Security',
    'Data and System',
  ])

  const settingsGroups: SettingsGroup[] = []

  for (const groupDef of NAV_STRUCTURE) {
    if (!settingsGroupLabels.has(groupDef.label)) continue

    // Find the resolved group
    const resolvedGroup = allGroups.find((g) => g.label === groupDef.label)
    if (!resolvedGroup) continue

    const entries = resolvedGroup.entities.map((entity) => ({
      slug: entity.slug,
      label: entity.label,
      description:
        SETTINGS_DESCRIPTIONS[entity.slug] ||
        `Manage ${entity.label.toLowerCase()}.`,
      href: entity.href,
    }))

    if (entries.length > 0) {
      settingsGroups.push({
        label: groupDef.label,
        entries,
      })
    }
  }

  return (
    <div className="settings-overview-page">
      <div className="settings-overview-page__header">
        <h1 className="settings-overview-page__title">Settings</h1>
        <p className="settings-overview-page__subtitle">
          Manage all site settings and configuration
        </p>
      </div>

      <SettingsOverviewSearch groups={settingsGroups} />
    </div>
  )
}

export default SettingsOverviewView
