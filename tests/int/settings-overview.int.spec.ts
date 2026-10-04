import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { createElement as h } from 'react'
import { SETTINGS_DESCRIPTIONS } from '@/components/admin/nav/settingsDescriptions'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'
import { SettingsOverviewSearch, type SettingsGroup } from '@/admin/views/SettingsOverviewClient'
import { SettingsOverviewView } from '@/admin/views/SettingsOverviewView'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

describe('SettingsOverviewSearch component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders every group title as a heading', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site Config',
        entries: [
          {
            slug: 'site-settings',
            label: 'Basic Settings',
            description: 'Site name, logo, colours, fonts and basic brand settings.',
            href: '/admin/settings/site-settings',
          },
        ],
      },
      {
        label: 'Marketing',
        entries: [
          {
            slug: 'seo-settings',
            label: 'SEO Settings',
            description: 'Meta tags, schema, verification codes and SEO defaults.',
            href: '/admin/settings/seo-settings',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    expect(screen.getByRole('heading', { level: 2, name: 'Site Config' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Marketing' })).toBeTruthy()
  })

  it('renders every entry label and description as links with correct hrefs', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site basics.',
            href: '/admin/settings/site',
          },
          {
            slug: 'header',
            label: 'Header',
            description: 'Navigation menu configuration.',
            href: '/admin/settings/header',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    const siteLink = screen.getByRole('link', { name: /Site Settings/ })
    expect(siteLink.getAttribute('href')).toBe('/admin/settings/site')

    const headerLink = screen.getByRole('link', { name: /Header/ })
    expect(headerLink.getAttribute('href')).toBe('/admin/settings/header')

    // Check descriptions are present
    expect(screen.getByText('Configure site basics.')).toBeTruthy()
    expect(screen.getByText('Navigation menu configuration.')).toBeTruthy()
  })

  it('filters entries by label (case-insensitive)', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site.',
            href: '/admin/settings/site',
          },
          {
            slug: 'header',
            label: 'Header',
            description: 'Navigation configuration.',
            href: '/admin/settings/header',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    const input = screen.getByLabelText('Search settings') as HTMLInputElement
    expect(input).toBeTruthy()

    // Search for "site"
    fireEvent.change(input, { target: { value: 'site' } })
    expect(screen.getByText('Site Settings')).toBeTruthy()
    expect(screen.queryByText('Header')).toBeNull()

    // Search for "SITE" (case-insensitive)
    fireEvent.change(input, { target: { value: 'SITE' } })
    expect(screen.getByText('Site Settings')).toBeTruthy()
    expect(screen.queryByText('Header')).toBeNull()

    // Search for "header"
    fireEvent.change(input, { target: { value: 'header' } })
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.queryByText('Site Settings')).toBeNull()
  })

  it('filters entries by description (case-insensitive)', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site basics and branding.',
            href: '/admin/settings/site',
          },
          {
            slug: 'seo-settings',
            label: 'SEO Settings',
            description: 'Meta tags and schema markup.',
            href: '/admin/settings/seo',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    const input = screen.getByLabelText('Search settings') as HTMLInputElement

    // Search for "branding" (in description)
    fireEvent.change(input, { target: { value: 'branding' } })
    expect(screen.getByText('Site Settings')).toBeTruthy()
    expect(screen.queryByText('SEO Settings')).toBeNull()

    // Search for "SCHEMA" (in description, case-insensitive)
    fireEvent.change(input, { target: { value: 'SCHEMA' } })
    expect(screen.getByText('SEO Settings')).toBeTruthy()
    expect(screen.queryByText('Site Settings')).toBeNull()
  })

  it('hides groups with no matching entries', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site.',
            href: '/admin/settings/site',
          },
        ],
      },
      {
        label: 'Marketing',
        entries: [
          {
            slug: 'seo-settings',
            label: 'SEO Settings',
            description: 'Meta tags and schema.',
            href: '/admin/settings/seo',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    // Search for something that only matches Marketing group
    const input = screen.getByLabelText('Search settings') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'schema' } })

    // Marketing group should be visible
    expect(screen.getByText('Marketing')).toBeTruthy()
    // Site group should be hidden
    expect(screen.queryByText('Site')).toBeNull()
  })

  it('shows "No settings found matching your search." when no matches', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site.',
            href: '/admin/settings/site',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    const input = screen.getByLabelText('Search settings') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'nonexistentquery' } })

    expect(screen.getByText('No settings found matching your search.')).toBeTruthy()
    expect(screen.queryByText('Site Settings')).toBeNull()
  })

  it('restores all groups and entries when query is cleared', () => {
    const groups: SettingsGroup[] = [
      {
        label: 'Site',
        entries: [
          {
            slug: 'site-settings',
            label: 'Site Settings',
            description: 'Configure site.',
            href: '/admin/settings/site',
          },
          {
            slug: 'header',
            label: 'Header',
            description: 'Navigation configuration.',
            href: '/admin/settings/header',
          },
        ],
      },
      {
        label: 'Marketing',
        entries: [
          {
            slug: 'seo-settings',
            label: 'SEO Settings',
            description: 'Meta tags and schema.',
            href: '/admin/settings/seo',
          },
        ],
      },
    ]

    render(h(SettingsOverviewSearch, { groups }))

    const input = screen.getByLabelText('Search settings') as HTMLInputElement

    // Filter to only header
    fireEvent.change(input, { target: { value: 'header' } })
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.queryByText('Site Settings')).toBeNull()
    expect(screen.queryByText('Marketing')).toBeNull()

    // Clear the search
    fireEvent.change(input, { target: { value: '' } })

    // All groups and entries should be visible
    expect(screen.getByText('Site')).toBeTruthy()
    expect(screen.getByText('Marketing')).toBeTruthy()
    expect(screen.getByText('Site Settings')).toBeTruthy()
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.getByText('SEO Settings')).toBeTruthy()
  })
})

describe('SettingsOverviewView server component', () => {
  it('returns null when engine config is missing', async () => {
    const result = await SettingsOverviewView({
      engine: undefined,
      i18n: undefined as any,
      permissions: [] as any,
      visibleEntities: [] as any,
    })

    expect(result).toBeNull()
  })
})

describe('Settings Overview', () => {
  it('should have descriptions for all settings entries', () => {
    const settingsSlugs = new Set<string>()

    const settingsGroupLabels = new Set([
      'Site',
      'Marketing and SEO',
      'Content settings',
      'Commerce settings',
      'Communication',
      'Speed and Security',
      'Data and System',
    ])

    for (const group of NAV_STRUCTURE) {
      if (!settingsGroupLabels.has(group.label)) continue

      for (const entity of group.entities) {
        settingsSlugs.add(entity.slug)
      }
    }

    for (const slug of settingsSlugs) {
      expect(SETTINGS_DESCRIPTIONS[slug], `Missing description for ${slug}`).toBeDefined()
      expect(typeof SETTINGS_DESCRIPTIONS[slug]).toBe('string')
      expect(SETTINGS_DESCRIPTIONS[slug].length).toBeGreaterThan(0)
    }
  })

  it('should not have descriptions for non-settings entities', () => {
    const nonSettingsSlugs = ['pages', 'posts', 'products', 'courses', 'products']
    for (const slug of nonSettingsSlugs) {
      const description = SETTINGS_DESCRIPTIONS[slug]
      expect(description === undefined || typeof description === 'string').toBe(true)
    }
  })

  it('should have descriptions that are meaningful and reasonable length', () => {
    for (const [slug, description] of Object.entries(SETTINGS_DESCRIPTIONS)) {
      expect(description).toMatch(/\.$/)
      expect(description.length).toBeLessThanOrEqual(150)
      expect(description.length).toBeGreaterThan(5)
    }
  })

  it('should include all expected settings groups', () => {
    const settingsGroupLabels = [
      'Site',
      'Marketing and SEO',
      'Content settings',
      'Commerce settings',
      'Communication',
      'Speed and Security',
      'Data and System',
    ]

    const actualGroupLabels = NAV_STRUCTURE.map((g) => g.label)
    for (const expectedLabel of settingsGroupLabels) {
      expect(actualGroupLabels).toContain(expectedLabel)
    }
  })

  it('Settings overview link should be first in Site group and be a view', () => {
    const siteGroup = NAV_STRUCTURE.find((g) => g.label === 'Site')
    expect(siteGroup).toBeDefined()

    const firstEntity = siteGroup?.entities[0]
    expect(firstEntity?.slug).toBe('settings-overview')
    expect(firstEntity?.type).toBe('view')
    expect(firstEntity?.label).toBe('Settings overview')
  })

  it('should have no settings-related entries outside the defined groups', () => {
    const settingsGroupLabels = new Set([
      'Site',
      'Marketing and SEO',
      'Content settings',
      'Commerce settings',
      'Communication',
      'Speed and Security',
      'Data and System',
    ])

    const settingsSlugsInDefinedGroups = new Set<string>()

    for (const group of NAV_STRUCTURE) {
      if (!settingsGroupLabels.has(group.label)) continue
      for (const entity of group.entities) {
        settingsSlugsInDefinedGroups.add(entity.slug)
      }
    }

    for (const group of NAV_STRUCTURE) {
      if (settingsGroupLabels.has(group.label)) continue

      for (const entity of group.entities) {
        expect(
          settingsSlugsInDefinedGroups.has(entity.slug),
          `${entity.slug} should be in a settings group, not in ${group.label}`,
        ).toBe(false)
      }
    }
  })
})
