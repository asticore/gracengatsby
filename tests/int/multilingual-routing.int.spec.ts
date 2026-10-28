import { describe, expect, it } from 'vitest'

import type { MultilingualSettings } from '@/features/multilingual/settings'
import { localeVariantPaths, localeVariantUrls, requestLocale, routeLocale } from '@/features/multilingual/routing'

const on: MultilingualSettings = {
  enabled: true,
  defaultLocale: 'en',
  activeLocales: ['en', 'fr'],
  fallbackToDefault: true,
  showLanguageSwitcher: true,
  switcherPosition: 'header',
  requireReview: false,
  adminsBypassReview: true,
  translationRules: {},
}
const off: MultilingualSettings = { ...on, enabled: false }
const single: MultilingualSettings = { ...on, activeLocales: ['en'] }

describe('routeLocale', () => {
  it('does nothing while multilingual is off or only one language is active', () => {
    expect(routeLocale('/fr/about', off)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/about', single)).toEqual({ kind: 'none' })
  })

  it('strips a non-default prefix and keeps the rest of the path', () => {
    expect(routeLocale('/fr/about', on)).toEqual({ kind: 'strip', locale: 'fr', rest: '/about' })
    expect(routeLocale('/fr', on)).toEqual({ kind: 'strip', locale: 'fr', rest: '/' })
    expect(routeLocale('/fr/', on)).toEqual({ kind: 'strip', locale: 'fr', rest: '/' })
    expect(routeLocale('/FR/Blog/post-1', on)).toEqual({ kind: 'strip', locale: 'fr', rest: '/Blog/post-1' })
  })

  it('redirects the default locale prefix to the unprefixed path', () => {
    expect(routeLocale('/en/about', on)).toEqual({ kind: 'default', location: '/about' })
    expect(routeLocale('/en', on)).toEqual({ kind: 'default', location: '/' })
  })

  it('leaves unknown prefixes, similar words and reserved paths alone', () => {
    expect(routeLocale('/about', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/french', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr-ca/about', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/admin', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/admin/content', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/api/search', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/_next/static/a.js', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/preview/x', on)).toEqual({ kind: 'none' })
  })

  it('never rewrites files, so sitemap, robots and llms keep their URLs', () => {
    expect(routeLocale('/fr/sitemap.xml', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/robots.txt', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/llms.txt', on)).toEqual({ kind: 'none' })
    expect(routeLocale('/fr/images/logo.png', on)).toEqual({ kind: 'none' })
  })
})

describe('requestLocale', () => {
  it('is null while multilingual is off, so the markup does not change', () => {
    expect(requestLocale('fr', off)).toBeNull()
    expect(requestLocale('fr', single)).toBeNull()
  })

  it('takes the locale the middleware set, and falls back to the default', () => {
    expect(requestLocale('fr', on)).toBe('fr')
    expect(requestLocale(undefined, on)).toBe('en')
    expect(requestLocale('de', on)).toBe('en')
  })
})

describe('localeVariantPaths and localeVariantUrls', () => {
  it('lists the page and each non-default locale copy', () => {
    expect(localeVariantPaths('/about', on)).toEqual(['/about', '/fr/about'])
    expect(localeVariantPaths('/', on)).toEqual(['/', '/fr'])
    expect(localeVariantPaths('/about', off)).toEqual(['/about'])
  })

  it('expands absolute URLs for purging and passes unparseable entries through', () => {
    expect(localeVariantUrls(['https://example.com/about'], on)).toEqual([
      'https://example.com/about',
      'https://example.com/fr/about',
    ])
    expect(localeVariantUrls(['not a url'], on)).toEqual(['not a url'])
    expect(localeVariantUrls(['https://example.com/about'], off)).toEqual(['https://example.com/about'])
  })
})
