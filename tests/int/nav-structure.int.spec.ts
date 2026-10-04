import { describe, it, expect } from 'vitest'
import { NAV_STRUCTURE, HIDDEN_FROM_NAV } from '@/components/admin/nav/navStructure'

describe('navStructure', () => {
  it('should have all old Settings entries either in new groups or hidden', () => {
    // Old flat Settings group entries (20 items total)
    const oldSettings = [
      'site-settings',
      'header',
      'footer',
      'seo-settings',
      'blog-settings',
      'faq-settings',
      'shop-settings',
      'member-settings',
      'email-settings',
      'media-settings',
      'speed-settings',
      'security-settings',
      'language-settings',
      'payment-settings',
      'form-settings',
      'backup-settings',
      'integrations',
      'translations',
      'database',
      'users',
      // Note: redirects was in Content, moving to Marketing and SEO
      'redirects',
      // Note: audit-log was in the fallback Other, moving to Data and System
      'audit-log',
    ]

    const allEntitySlugs = new Set<string>()
    for (const group of NAV_STRUCTURE) {
      for (const entity of group.entities) {
        allEntitySlugs.add(entity.slug)
      }
    }

    for (const slug of oldSettings) {
      const isListed = allEntitySlugs.has(slug)
      const isHidden = HIDDEN_FROM_NAV.has(slug)
      expect(isListed || isHidden, `${slug} should be listed in a group or hidden, but is neither`).toBe(true)
    }
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

  it('should not list redirects in the Content group', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    expect(contentGroup).toBeDefined()

    const hasRedirects = contentGroup?.entities.some((e) => e.slug === 'redirects')
    expect(hasRedirects).toBe(false)
  })

  it('should list redirects in Marketing and SEO group', () => {
    const marketingGroup = NAV_STRUCTURE.find((g) => g.label === 'Marketing and SEO')
    expect(marketingGroup).toBeDefined()

    const hasRedirects = marketingGroup?.entities.some((e) => e.slug === 'redirects')
    expect(hasRedirects).toBe(true)
  })

  it('should have all required Settings groups in correct order', () => {
    const expectedGroups = [
      'Content',
      'Shop',
      'Members',
      'Courses',
      'Site',
      'Marketing and SEO',
      'Content settings',
      'Commerce settings',
      'Communication',
      'Speed and Security',
      'Data and System',
    ]

    const actualLabels = NAV_STRUCTURE.map((g) => g.label)
    expect(actualLabels).toEqual(expectedGroups)
  })

  it('Site group should have Settings overview, site-settings, header, footer, language-settings, and translations', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    expect(siteGroup).toBeDefined()

    const expectedSlugs = [
      'settings-overview',
      'site-settings',
      'header',
      'footer',
      'language-settings',
      'translations',
    ]
    const actualSlugs = siteGroup?.entities.map((e) => e.slug) || []
    expect(actualSlugs).toEqual(expectedSlugs)
  })

  it('Data and System group should include audit-log, database, backup-settings, and users', () => {
    const dataGroup = NAV_STRUCTURE.find((g) => g.label === 'Data and System')
    expect(dataGroup).toBeDefined()

    const expectedSlugs = ['backup-settings', 'database', 'audit-log', 'users']
    const actualSlugs = dataGroup?.entities.map((e) => e.slug) || []
    expect(actualSlugs).toEqual(expectedSlugs)
  })

  it('should hide backups from navigation', () => {
    expect(HIDDEN_FROM_NAV.has('backups')).toBe(true)
  })

  it('Settings overview view should be a view type with href and label', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    const overviewRef = siteGroup?.entities.find((e) => e.slug === 'settings-overview')

    expect(overviewRef).toBeDefined()
    expect(overviewRef?.type).toBe('view')
    expect(overviewRef?.href).toBe('/settings')
    expect(overviewRef?.label).toBe('Settings overview')
  })
})
