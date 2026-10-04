import { describe, it, expect } from 'vitest'
import { resolveEntityGroups, type ResolvedGroup } from '@/components/admin/shared/resolveEntities'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'

describe('AdminNavClient with Settings sections', () => {
  it('should have ResolvedGroup with section field carrying settings marker', () => {
    const settingsGroups = NAV_STRUCTURE.filter((g) => g.section === 'settings')
    expect(settingsGroups.length).toBe(7)

    const settingsLabels = [
      'Site',
      'Marketing and SEO',
      'Content settings',
      'Commerce settings',
      'Communication',
      'Speed and Security',
      'Data and System',
    ]

    for (const label of settingsLabels) {
      const group = NAV_STRUCTURE.find((g) => g.label === label)
      expect(group?.section).toBe('settings')
    }
  })

  it('should separate top-level groups from settings groups', () => {
    const topLevelGroups = NAV_STRUCTURE.filter((g) => g.section !== 'settings')
    expect(topLevelGroups.length).toBe(4) // Content, Shop, Members, Courses

    const topLevelLabels = topLevelGroups.map((g) => g.label)
    expect(topLevelLabels).toEqual(['Content', 'Shop', 'Members', 'Courses'])
  })

  it('should preserve entity structure within settings groups', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    expect(siteGroup?.section).toBe('settings')
    expect(siteGroup?.entities.length).toBeGreaterThan(0)

    // Verify entities include settings overview link
    const hasOverview = siteGroup?.entities.some((e) => e.slug === 'settings-overview')
    expect(hasOverview).toBe(true)
  })

  it('Settings overview should be the first entity in Site group', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    expect(siteGroup?.entities[0].slug).toBe('settings-overview')
  })

  it('should have proper order: top-level groups, then Settings parent with 7 sub-groups, then Other', () => {
    const topLevelCount = NAV_STRUCTURE.filter((g) => g.section !== 'settings').length
    const settingsCount = NAV_STRUCTURE.filter((g) => g.section === 'settings').length

    expect(topLevelCount).toBe(4) // Content, Shop, Members, Courses
    expect(settingsCount).toBe(7) // 7 settings groups
    // The order in NAV_STRUCTURE shows: Content, Shop, Members, Courses (top-level),
    // then Site, Marketing and SEO, Content settings, Commerce settings, Communication,
    // Speed and Security, Data and System (settings)
    const labels = NAV_STRUCTURE.map((g) => g.label)
    const firstSettingsIndex = labels.findIndex((l) => l === 'Site')
    expect(firstSettingsIndex).toBe(4) // After 4 top-level groups
  })

  it('Settings parent accordion should contain exactly 7 sub-groups', () => {
    const settingsGroups = NAV_STRUCTURE.filter((g) => g.section === 'settings')
    expect(settingsGroups.length).toBe(7)

    // Each should have entities
    for (const group of settingsGroups) {
      expect(group.entities.length).toBeGreaterThan(0)
    }
  })

  it('all settings groups should have distinct labels', () => {
    const settingsGroups = NAV_STRUCTURE.filter((g) => g.section === 'settings')
    const labels = settingsGroups.map((g) => g.label)
    const uniqueLabels = new Set(labels)
    expect(uniqueLabels.size).toBe(labels.length)
  })

  it('each settings group entity should have correct structure for nested rendering', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    expect(siteGroup).toBeDefined()

    for (const entity of siteGroup?.entities || []) {
      expect(entity.slug).toBeDefined()
      expect(entity.type).toMatch(/^(collections|globals|view)$/)
      // view type entities have label, collections/globals may not in NAV_STRUCTURE
      if (entity.type === 'view') {
        expect(entity.label).toBeDefined()
      }
    }
  })
})
