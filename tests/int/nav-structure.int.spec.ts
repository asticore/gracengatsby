import { describe, it, expect } from 'vitest'
import { NAV_STRUCTURE, HIDDEN_FROM_NAV } from '@/components/admin/nav/navStructure'
import { SETTINGS_DESCRIPTIONS } from '@/components/admin/nav/settingsDescriptions'
import { resolveEntityGroups } from '@/components/admin/shared/resolveEntities'

describe('navStructure', () => {
  it('should have all top-level groups in correct order', () => {
    const expectedGroups = [
      'Content',
      'Shop',
      'Members',
      'Courses',
      'Ads',
      'SEO',
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

  it('Settings group should have the 7 settings views and then the Roles view, in order', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    expect(settingsGroup).toBeDefined()

    const expectedSlugs = [
      'settings-site',
      'settings-content',
      'settings-commerce',
      'settings-communication',
      'settings-speed',
      'settings-security',
      'settings-data-system',
      'roles',
    ]

    const viewEntities = (settingsGroup?.entities || []).filter((e) => e.type === 'view')
    const actualSlugs = viewEntities.map((e) => e.slug)
    expect(actualSlugs).toEqual(expectedSlugs)

    // Roles is the last Settings entry and opens the /roles screen, not the plain collection list.
    expect(settingsGroup?.entities.at(-1)).toEqual({ slug: 'roles', type: 'view', href: '/roles', label: 'Roles' })

    // All settings views should be type 'view'
    for (const entity of viewEntities) {
      expect(entity.type).toBe('view')
      expect(entity.href).toBeDefined()
      expect(entity.label).toBeDefined()
    }
  })

  it('Settings group entries should have correct hrefs and labels', () => {
    const settingsGroup = NAV_STRUCTURE.find((g) => g.label === 'Settings')
    const entries = (settingsGroup?.entities || []).filter((e) => e.type === 'view')

    const expectedMapping: Record<string, { href: string; label: string }> = {
      'settings-site': { href: '/settings/site', label: 'Site' },
      'settings-content': { href: '/settings/content', label: 'Content' },
      'settings-commerce': { href: '/settings/commerce', label: 'Commerce' },
      'settings-communication': { href: '/settings/communication', label: 'Communication' },
      'settings-speed': { href: '/settings/speed', label: 'Speed' },
      'settings-security': { href: '/settings/security', label: 'Security' },
      'settings-data-system': { href: '/settings/data-system', label: 'Data and System' },
      roles: { href: '/roles', label: 'Roles' },
    }

    for (const entity of entries) {
      const expected = expectedMapping[entity.slug]
      expect(expected).toBeDefined()
      expect(entity.href).toBe(expected.href)
      expect(entity.label).toBe(expected.label)
    }
  })

  it('Content group should include header-footer, and redirects now live in the SEO group', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    expect(contentGroup).toBeDefined()

    const slugs = contentGroup?.entities.map((e) => e.slug) || []
    expect(slugs).toContain('header-footer')
    expect(slugs).not.toContain('redirects')
  })

  it('header-footer should be a view type with correct href and label', () => {
    const contentGroup = NAV_STRUCTURE.find((g) => g.label === 'Content')
    const headerFooterRef = contentGroup?.entities.find((e) => e.slug === 'header-footer')

    expect(headerFooterRef).toBeDefined()
    expect(headerFooterRef?.type).toBe('view')
    expect(headerFooterRef?.href).toBe('/header-footer')
    expect(headerFooterRef?.label).toBe('Header and footer')
  })

  it('the standalone results pages are no longer in the nav (their tabs live on the edit pages)', () => {
    const allSlugs = NAV_STRUCTURE.flatMap((g) => g.entities.map((e) => e.slug))
    expect(allSlugs).not.toContain('ab-test-results')
    expect(allSlugs).not.toContain('event-rsvps')
    expect(allSlugs).not.toContain('form-submissions')

    // ...but the collections stay hidden so they do not fall into the "Other" group, and the
    // A/B tests collection itself is still listed.
    expect(HIDDEN_FROM_NAV.has('event-rsvps')).toBe(true)
    expect(HIDDEN_FROM_NAV.has('form-submissions')).toBe(true)
    expect(allSlugs).toContain('ab-tests')
    expect(allSlugs).toContain('events')
    expect(allSlugs).toContain('forms')
  })

  it('the roles collection is hidden from the nav, so the Roles view is its only entry', () => {
    expect(HIDDEN_FROM_NAV.has('roles')).toBe(true)
    const rolesEntries = NAV_STRUCTURE.flatMap((g) => g.entities).filter((e) => e.slug === 'roles')
    expect(rolesEntries).toEqual([{ slug: 'roles', type: 'view', href: '/roles', label: 'Roles' }])
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

  it('the sidebar shows the Roles view to admins only, and never as a collection link', () => {
    const engine = { config: { routes: { admin: '/admin' }, collections: [], globals: [] } } as never
    const base = {
      engine,
      flags: {} as never,
      i18n: { language: 'en', t: (key: never) => key },
      visibleEntities: { collections: [] as string[], globals: [] as string[] },
      permissions: { collections: {}, globals: {} },
    }
    const rolesIn = (groups: ReturnType<typeof resolveEntityGroups>) =>
      groups.flatMap((g) => g.entities).filter((e) => e.slug === 'roles')

    const adminRoles = rolesIn(resolveEntityGroups({ ...base, isAdmin: true }))
    expect(adminRoles).toHaveLength(1)
    expect(adminRoles[0]).toMatchObject({ type: 'collections', href: '/admin/roles', label: 'Roles' })

    expect(rolesIn(resolveEntityGroups({ ...base, isAdmin: false }))).toHaveLength(0)
  })

  it('hides the Ads overview and report links from users without ad-units / ad-reports read', () => {
    const engine = { config: { routes: { admin: '/admin' }, collections: [], globals: [] } } as never
    const base = {
      engine,
      flags: { ads: true } as never,
      i18n: { language: 'en', t: (key: never) => key },
      visibleEntities: { collections: [] as string[], globals: [] as string[] },
      permissions: { collections: {}, globals: {} },
      isAdmin: false,
    }
    const slugs = (can: (resource: string, action: string) => boolean) =>
      resolveEntityGroups({ ...base, can: can as never }).flatMap((g) => g.entities).map((e) => e.slug).filter((s) => s.startsWith('ads-'))
    expect(slugs(() => false)).toEqual([])
    expect(slugs((r) => r === 'ad-units')).toEqual(['ads-overview'])
    expect(slugs((r) => r === 'ad-reports')).toEqual(['ads-report'])
    expect(slugs(() => true).sort()).toEqual(['ads-overview', 'ads-report'])
  })
})
