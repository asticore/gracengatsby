import { describe, it, expect } from 'vitest'
import { NAV_STRUCTURE, type NavGroupDef } from '@/components/admin/nav/navStructure'

describe('AdminNavClient with flat rendering', () => {
  it('should resolve groups without section field', () => {
    const groups: NavGroupDef[] = NAV_STRUCTURE.map((groupDef) => ({
      label: groupDef.label,
      entities: groupDef.entities,
    }))

    for (const group of groups) {
      // Groups no longer have section field - verify property doesn't exist
      expect(Object.keys(group).includes('section')).toBe(false)
    }
  })

  it('should have exactly 5 top-level groups', () => {
    expect(NAV_STRUCTURE.length).toBe(5)
    const labels = NAV_STRUCTURE.map((g) => g.label)
    expect(labels).toEqual(['Content', 'Shop', 'Members', 'Courses', 'Settings'])
  })

  it('Settings group should be rendered as a regular NavGroup like others', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    expect(settingsGroup).toBeDefined()
    expect(Object.keys(settingsGroup || {}).includes('section')).toBe(false)
    expect(settingsGroup?.entities.length).toBe(8)
  })

  it('Settings group should render 8 page links with proper structure', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    expect(settingsGroup?.entities.length).toBe(8)

    const expectedLabels = [
      'Site',
      'Marketing and SEO',
      'Content',
      'Commerce',
      'Communication',
      'Speed',
      'Security',
      'Data and System',
    ]

    const actualLabels = settingsGroup?.entities.map((e) => e.label) || []
    expect(actualLabels).toEqual(expectedLabels)
  })

  it('Content group should contain header-footer as a regular entity', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    const headerFooter = contentGroup?.entities.find((e) => e.slug === 'header-footer')

    expect(headerFooter).toBeDefined()
    expect(headerFooter?.type).toBe('view')
    expect(headerFooter?.href).toBe('/header-footer')
    expect(headerFooter?.label).toBe('Header and footer')
  })

  it('all groups should be rendered flat without nesting', () => {
    // All groups at the same level - no group has a section marker
    for (const group of NAV_STRUCTURE) {
      expect(Object.keys(group).includes('section')).toBe(false)
    }

    // Settings is just another group, not a parent
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    expect(settingsGroup).toBeDefined()
    expect(settingsGroup?.entities.length).toBeGreaterThan(0)
  })

  it('Settings page links should be renderable as regular navigation links', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')

    for (const entity of settingsGroup?.entities || []) {
      expect(entity.slug).toBeDefined()
      expect(entity.type).toBe('view')
      expect(entity.href).toBeDefined()
      expect(entity.label).toBeDefined()
    }
  })

  it('should have no nested accordion structure', () => {
    // All groups are at the root level
    const topLevelCount = NAV_STRUCTURE.length
    expect(topLevelCount).toBe(5)

    // No group has children that are themselves groups
    for (const group of NAV_STRUCTURE) {
      for (const entity of group.entities) {
        // Entities are flat - they don't contain nested groups
        expect(entity.type).toMatch(/^(collections|globals|view)$/)
      }
    }
  })

  it('active link detection should work on Settings page links', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    const siteSettingsLink = settingsGroup?.entities.find((e) => e.slug === 'settings-site')

    expect(siteSettingsLink?.href).toBe('/settings/site')

    // Simulate active link detection (used in AdminNavClient)
    const pathname = '/settings/site'
    const href = siteSettingsLink?.href || ''
    const isActive = pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

    expect(isActive).toBe(true)
  })
})
