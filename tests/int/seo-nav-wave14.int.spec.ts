import { describe, it, expect } from 'vitest'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'
import { resolveEntityGroups } from '@/components/admin/shared/resolveEntities'

const SEO_SLUGS = ['seo-audit', 'google-dashboard', 'seo-settings', 'redirects']

const engine = {
  config: {
    routes: { admin: '/admin' },
    collections: [
      { slug: 'redirects', labels: { plural: 'Redirects', singular: 'Redirect' } },
    ],
    globals: [{ slug: 'seo-settings', label: 'SEO & Analytics' }],
  },
} as never

const baseArgs = {
  engine,
  flags: { seo: true } as never,
  i18n: { language: 'en', t: (key: never) => key },
  visibleEntities: { collections: ['redirects'], globals: ['seo-settings'] },
  permissions: {
    collections: { redirects: { read: true, create: true, update: true, delete: true } },
    globals: { 'seo-settings': { read: true } },
  },
}

describe('SEO nav group (wave 14)', () => {
  it('has one SEO group with the audit, SEO settings and redirects, in that order', () => {
    const seoGroups = NAV_STRUCTURE.filter((g) => g.label === 'SEO')
    expect(seoGroups).toHaveLength(1)
    expect(seoGroups[0].entities.map((e) => e.slug)).toEqual(SEO_SLUGS)
  })

  it('places the SEO group before Settings', () => {
    const labels = NAV_STRUCTURE.map((g) => g.label)
    expect(labels.indexOf('SEO')).toBeLessThan(labels.indexOf('Settings'))
  })

  it('points the audit entry at the custom screen and the SEO settings at the global', () => {
    const seoGroup = NAV_STRUCTURE.find((g) => g.label === 'SEO')
    const audit = seoGroup?.entities.find((e) => e.slug === 'seo-audit')
    expect(audit).toEqual({ slug: 'seo-audit', type: 'view', href: '/seo-audit', label: 'SEO audit' })
    expect(seoGroup?.entities.find((e) => e.slug === 'seo-settings')).toEqual({ slug: 'seo-settings', type: 'globals' })
    expect(seoGroup?.entities.find((e) => e.slug === 'redirects')).toEqual({ slug: 'redirects', type: 'collections' })
  })

  it('lists each SEO entry once and no longer shows the Marketing and SEO settings card', () => {
    const allSlugs = NAV_STRUCTURE.flatMap((g) => g.entities.map((e) => e.slug))
    for (const slug of SEO_SLUGS) {
      expect(allSlugs.filter((s) => s === slug)).toHaveLength(1)
    }
    expect(allSlugs).not.toContain('settings-marketing-seo')
  })

  it('shows the SEO group to an admin with the audit, SEO settings and redirects', () => {
    const groups = resolveEntityGroups({ ...baseArgs, isAdmin: true, can: () => true })
    const seo = groups.find((g) => g.label === 'SEO')
    expect(seo?.entities.map((e) => e.slug)).toEqual(SEO_SLUGS)
    expect(seo?.entities.find((e) => e.slug === 'seo-audit')?.href).toBe('/admin/seo-audit')
  })

  it('hides the SEO audit from a user without SEO-editing permission, but keeps the rest', () => {
    const groups = resolveEntityGroups({ ...baseArgs, isAdmin: false, can: () => false })
    const seo = groups.find((g) => g.label === 'SEO')
    expect(seo?.entities.map((e) => e.slug)).not.toContain('seo-audit')
  })

  it('shows the SEO audit to a user with SEO-editing permission', () => {
    const groups = resolveEntityGroups({
      ...baseArgs,
      isAdmin: false,
      can: (resource, action) => resource === 'content.editSeo' && action === 'update',
    })
    const seo = groups.find((g) => g.label === 'SEO')
    expect(seo?.entities.map((e) => e.slug)).toContain('seo-audit')
  })
})
