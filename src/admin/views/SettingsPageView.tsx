import { notFound, redirect } from 'next/navigation'
import type { Field } from '@/engine'
import { getAdminContext, getGlobalConfig } from '@/admin/auth'
import { readFeatureFlags } from '@/components/admin/shared/resolveEntities'
import { isGlobalEnabled } from '@/features/registry'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { SETTINGS_PAGES, type SettingsPage, type GlobalSection, type LinkSection } from '@/admin/settingsPages'
import { SettingsPageClient, type SettingsPageSection } from './SettingsPageClient'

/**
 * Settings page view factory. Creates server components for each page in
 * SETTINGS_PAGES, loaded with globals and rendered with feature-flag visibility.
 *
 * Renders:
 * - Page title and description
 * - A sticky jump-bar (anchor links) when 2+ sections
 * - Global sections as titled cards with EditForms
 * - Link sections as a grid of link cards
 * - "No access" message if all sections are hidden by permissions
 */

export async function SettingsPageView({ pageKey }: { pageKey: string }) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const page = SETTINGS_PAGES.find((p) => p.key === pageKey)
  if (!page) notFound()

  const flags = await readFeatureFlags(context.engine)
  const canRead = (slug: string) =>
    Boolean(context.permissions.globals?.[slug]?.read) && isGlobalEnabled(slug, flags)
  const collectionExists = (slug: string) =>
    Boolean(context.permissions.collections?.[slug]?.read)

  // Load all globals in parallel
  const loadedGlobals = await Promise.all(
    page.sections
      .filter((s): s is GlobalSection => s.kind === 'global')
      .map(async (section) => {
        if (!canRead(section.slug)) return null

        const globalConfig = getGlobalConfig(context.engine, section.slug)
        if (!globalConfig) return null

        const doc = await context.engine.findGlobal({
          slug: section.slug,
          user: context.user,
        })

        return {
          slug: section.slug,
          label: typeof globalConfig.label === 'string' ? globalConfig.label : section.slug,
          fields: sanitizeFieldsForClient(globalConfig.fields),
          doc,
        }
      })
  )

  const globalsBySlug = new Map(
    loadedGlobals.filter((g) => g !== null).map((g) => [g.slug, g])
  )

  // Build visible sections (globals and links)
  const visibleSections: SettingsPageSection[] = []
  let hasAccessToAnyGlobal = false

  for (const section of page.sections) {
    if (section.kind === 'global') {
      const global = globalsBySlug.get(section.slug)
      if (global) {
        visibleSections.push({
          kind: 'global',
          slug: global.slug,
          label: global.label,
          fields: global.fields,
          doc: global.doc,
        })
        hasAccessToAnyGlobal = true
      }
    } else {
      const link = section as LinkSection
      if (link.type === 'collection') {
        const slug = link.href.replace(/^\/collections\//, '')
        if (!collectionExists(slug)) continue
      }
      visibleSections.push(link)
    }
  }

  // If no globals are visible, show "no access" message
  const hasGlobals = page.sections.some((s) => s.kind === 'global')
  if (hasGlobals && !hasAccessToAnyGlobal) {
    return <p>You do not have access to these settings.</p>
  }

  return <SettingsPageClient page={page} sections={visibleSections} />
}

export default SettingsPageView

export const SETTINGS_PAGE_VIEWS = SETTINGS_PAGES.map((page) => ({
  key: `settings-${page.key}`,
  Component: () => SettingsPageView({ pageKey: page.key }),
  path: page.path,
  meta: { title: page.title, description: page.description },
}))
