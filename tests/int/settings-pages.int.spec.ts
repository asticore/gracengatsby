import { describe, it, expect, beforeEach } from 'vitest'
import { SETTINGS_PAGES } from '@/admin/settingsPages'
import { CUSTOM_ADMIN_VIEWS } from '@/admin/adminViewRegistry'

describe('Settings Pages Configuration', () => {
  describe('SETTINGS_PAGES structure', () => {
    it('exports exactly 8 pages', () => {
      expect(SETTINGS_PAGES).toHaveLength(8)
    })

    it('has unique keys for each page', () => {
      const keys = SETTINGS_PAGES.map((p) => p.key)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it('has unique paths for each page', () => {
      const paths = SETTINGS_PAGES.map((p) => p.path)
      const uniquePaths = new Set(paths)
      expect(uniquePaths.size).toBe(paths.length)
    })

    it('all paths start with /settings/', () => {
      SETTINGS_PAGES.forEach((page) => {
        expect(page.path).toMatch(/^\/settings\//)
      })
    })

    it('all pages have title and description', () => {
      SETTINGS_PAGES.forEach((page) => {
        expect(page.title).toBeTruthy()
        expect(page.description).toBeTruthy()
      })
    })
  })

  describe('Page structure', () => {
    it('Site page has correct sections', () => {
      const site = SETTINGS_PAGES.find((p) => p.key === 'site')
      expect(site).toBeTruthy()
      expect(site?.sections).toContainEqual({ kind: 'global', slug: 'site-settings' })
      expect(site?.sections).toContainEqual({ kind: 'global', slug: 'language-settings' })
      expect(site?.sections.some((s) => s.kind === 'link' && s.label === 'Translations')).toBe(true)
    })

    it('Marketing and SEO page has correct sections', () => {
      const markedting = SETTINGS_PAGES.find((p) => p.key === 'marketing-seo')
      expect(markedting).toBeTruthy()
      expect(markedting?.sections).toContainEqual({ kind: 'global', slug: 'seo-settings' })
      expect(markedting?.sections).not.toContainEqual({ kind: 'global', slug: 'integrations' })
      const site = SETTINGS_PAGES.find((p) => p.key === 'site')
      expect(site?.sections).toContainEqual({ kind: 'global', slug: 'integrations' })
      expect(markedting?.sections.some((s) => s.kind === 'link' && s.label === 'Redirects')).toBe(true)
    })

    it('Content page has correct sections', () => {
      const content = SETTINGS_PAGES.find((p) => p.key === 'content')
      expect(content).toBeTruthy()
      expect(content?.sections).toContainEqual({ kind: 'global', slug: 'blog-settings' })
      expect(content?.sections).toContainEqual({ kind: 'global', slug: 'faq-settings' })
      expect(content?.sections).toContainEqual({ kind: 'global', slug: 'form-settings' })
      expect(content?.sections).toContainEqual({ kind: 'global', slug: 'media-settings' })
    })

    it('Commerce page has correct sections', () => {
      const commerce = SETTINGS_PAGES.find((p) => p.key === 'commerce')
      expect(commerce).toBeTruthy()
      expect(commerce?.sections).toContainEqual({ kind: 'global', slug: 'shop-settings' })
      expect(commerce?.sections).toContainEqual({ kind: 'global', slug: 'payment-settings' })
      expect(commerce?.sections).toContainEqual({ kind: 'global', slug: 'member-settings' })
    })

    it('Communication page has correct sections', () => {
      const communication = SETTINGS_PAGES.find((p) => p.key === 'communication')
      expect(communication).toBeTruthy()
      expect(communication?.sections).toContainEqual({ kind: 'global', slug: 'email-settings' })
    })

    it('Speed page has correct sections', () => {
      const speed = SETTINGS_PAGES.find((p) => p.key === 'speed')
      expect(speed).toBeTruthy()
      expect(speed?.sections).toContainEqual({ kind: 'global', slug: 'speed-settings' })
    })

    it('Security page has correct sections', () => {
      const security = SETTINGS_PAGES.find((p) => p.key === 'security')
      expect(security).toBeTruthy()
      expect(security?.sections).toContainEqual({ kind: 'global', slug: 'security-settings' })
    })

    it('Data and System page has correct sections', () => {
      const dataSystem = SETTINGS_PAGES.find((p) => p.key === 'data-system')
      expect(dataSystem).toBeTruthy()
      expect(dataSystem?.sections).toContainEqual({ kind: 'global', slug: 'backup-settings' })
      expect(dataSystem?.sections.some((s) => s.kind === 'link' && s.label === 'Database')).toBe(true)
      expect(dataSystem?.sections.some((s) => s.kind === 'link' && s.label === 'Users')).toBe(true)
      expect(dataSystem?.sections.some((s) => s.kind === 'link' && s.label === 'Audit log')).toBe(true)
    })
  })

  describe('Global coverage', () => {
    const oldSettingSlugs = [
      'site-settings',
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
    ]

    it('covers all old setting slugs exactly once (excluding header/footer)', () => {
      const covered = new Set<string>()
      SETTINGS_PAGES.forEach((page) => {
        page.sections.forEach((section) => {
          if (section.kind === 'global') {
            covered.add(section.slug)
          }
        })
      })

      const allSettingSlugs = oldSettingSlugs.sort()
      const coveredSlugs = Array.from(covered).sort()

      expect(coveredSlugs).toEqual(allSettingSlugs)
    })
  })

  describe('Admin view registry', () => {
    it('registers all 8 settings pages', () => {
      const settingsViews = CUSTOM_ADMIN_VIEWS.filter((v) => v.key.startsWith('settings-'))
      expect(settingsViews).toHaveLength(8)
    })

    it('settings views have correct paths', () => {
      SETTINGS_PAGES.forEach((page) => {
        const view = CUSTOM_ADMIN_VIEWS.find((v) => v.key === `settings-${page.key}`)
        expect(view).toBeTruthy()
        expect(view?.path).toBe(page.path)
      })
    })

    it('settings views have correct meta', () => {
      SETTINGS_PAGES.forEach((page) => {
        const view = CUSTOM_ADMIN_VIEWS.find((v) => v.key === `settings-${page.key}`)
        expect(view).toBeTruthy()
        expect('meta' in view!).toBe(true)
        if ('meta' in view!) {
          expect((view as any).meta?.title).toBe(page.title)
          expect((view as any).meta?.description).toBe(page.description)
        }
      })
    })

    it('does not register settingsOverview view', () => {
      const settingsOverview = CUSTOM_ADMIN_VIEWS.find((v) => v.key === 'settingsOverview')
      expect(settingsOverview).toBeUndefined()
    })

    it('does register headerFooter view', () => {
      const headerFooter = CUSTOM_ADMIN_VIEWS.find((v) => v.key === 'headerFooter')
      expect(headerFooter).toBeTruthy()
      expect(headerFooter?.path).toBe('/header-footer')
    })
  })
})
