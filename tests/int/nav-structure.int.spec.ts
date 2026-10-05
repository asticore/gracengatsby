import { describe, it, expect } from 'vitest'
import { NAV_STRUCTURE, HIDDEN_FROM_NAV } from '@/components/admin/nav/navStructure'
import { SETTINGS_DESCRIPTIONS } from '@/components/admin/nav/settingsDescriptions'

describe('navStructure', () => {
  it('should have all top-level groups in correct order', () => {
    const expectedGroups = [
      'Content',
      'Shop',
      'Members',
      'Courses',
      'Settings',
    ]

    const actualLabels = NAV_STRUCTURE.map((g) => g.label)
    expect(actualLabels).toEqual(expectedGroups)
  })

  it('should have no section field on any groups', () => {
    for (const group of NAV_STRUCTURE) {
      expect('section' in group).toBe(false)
    }
  })

  it('Settings group should have exactly 8 view entries in correct order', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    expect(settingsGroup).toBeDefined()

    const expectedSlugs = [
      'settings-site',
      'settings-marketing-seo',
      'settings-content',
      'settings-commerce',
      'settings-communication',
      'settings-speed',
      'settings-security',
      'settings-data-system',
    ]

    const actualSlugs = settingsGroup?.entities.map((e) => e.slug) || []
    expect(actualSlugs).toEqual(expectedSlugs)

    // All should be type 'view'
    for (const entity of settingsGroup?.entities || []) {
      expect(entity.type).toBe('view')
      expect(entity.href).toBeDefined()
      expect(entity.label).toBeDefined()
    }
  })

  it('Settings group entries should have correct hrefs and labels', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    const entries = settingsGroup?.entities || []

    const expectedMapping: Record<string, { href: string; label: string }> = {
      'settings-site': { href: '/settings/site', label: 'Site' },
      'settings-marketing-seo': { href: '/settings/marketing-seo', label: 'Marketing and SEO' },
      'settings-content': { href: '/settings/content', label: 'Content' },
      'settings-commerce': { href: '/settings/commerce', label: 'Commerce' },
      'settings-communication': { href: '/settings/communication', label: 'Communication' },
      'settings-speed': { href: '/settings/speed', label: 'Speed' },
      'settings-security': { href: '/settings/security', label: 'Security' },
      'settings-data-system': { href: '/settings/data-system', label: 'Data and System' },
    }

    for (const entity of entries) {
      const expected = expectedMapping[entity.slug]
      expect(expected).toBeDefined()
      expect(entity.href).toBe(expected.href)
      expect(entity.label).toBe(expected.label)
    }
  })

  it('Content group should include header-footer and redirects', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    expect(contentGroup).toBeDefined()

    const slugs = contentGroup?.entities.map((e) => e.slug) || []
    expect(slugs).toContain('header-footer')
    expect(slugs).toContain('redirects')
  })

  it('header-footer should be a view type with correct href and label', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    const headerFooterRef = contentGroup?.entities.find((e) => e.slug === 'header-footer')

    expect(headerFooterRef).toBeDefined()
    expect(headerFooterRef?.type).toBe('view')
    expect(headerFooterRef?.href).toBe('/header-footer')
    expect(headerFooterRef?.label).toBe('Header and footer')
  })

  it('should have no duplicate entries across all groups', () => {
    const seen = new Set<string>()
    for (const group of NAV_STRUCTURE) {
      for (const entity of group.entities) {
        expect(seen.has(entity.slug), `${entity.slug} appears in multiple groups`).toBe(false)
        seen.add(entity.slug)
      }
    }
  })

  it('old settings globals and special collections should be in HIDDEN_FROM_NAV', () => {
    const hiddenSlugs = [
      'header',
      'footer',
      'site-settings',
      'language-settings',
      'seo-settings',
      'blog-settings',
      'faq-settings',
      'form-settings',
      'media-settings',
      'shop-settings',
      'payment-settings',
      'member-settings',
      'email-settings',
      'speed-settings',
      'security-settings',
      'backup-settings',
      'database',
      'audit-log',
      'users',
      'integrations',
      'translations',
    ]

    for (const slug of hiddenSlugs) {
      expect(HIDDEN_FROM_NAV.has(slug), `${slug} should be in HIDDEN_FROM_NAV`).toBe(true)
    }
  })

  it('should have new settings page descriptions', () => {
    const newDescriptions = [
      'settings-site',
      'settings-marketing-seo',
      'settings-content',
      'settings-commerce',
      'settings-communication',
      'settings-speed',
      'settings-security',
      'settings-data-system',
    ]

    for (const slug of newDescriptions) {
      expect(SETTINGS_DESCRIPTIONS[slug]).toBeDefined()
      expect(SETTINGS_DESCRIPTIONS[slug].length).toBeGreaterThan(0)
    }
  })

  it('should preserve old settings descriptions for backward compatibility', () => {
    const oldSlugs = [
      'header',
      'footer',
      'header-footer',
      'site-settings',
      'language-settings',
      'seo-settings',
      'blog-settings',
      'faq-settings',
      'form-settings',
      'media-settings',
      'shop-settings',
      'payment-settings',
      'member-settings',
      'email-settings',
      'speed-settings',
      'security-settings',
      'backup-settings',
      'database',
      'audit-log',
      'users',
      'integrations',
      'translations',
    ]

    for (const slug of oldSlugs) {
      expect(SETTINGS_DESCRIPTIONS[slug]).toBeDefined()
    }
  })
})
