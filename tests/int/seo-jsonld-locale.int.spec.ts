// @vitest-environment node
// JSON-LD for a non-default language: the page URL and breadcrumb URLs carry the locale prefix.
import { describe, expect, it } from 'vitest'

import { breadcrumbTrail, withLocalePrefix } from '@/features/seo/schemaNodes'

const BASE = 'https://example.com'

describe('withLocalePrefix', () => {
  it('leaves the default language alone', () => {
    expect(withLocalePrefix('/about', '')).toBe('/about')
    expect(withLocalePrefix('/about')).toBe('/about')
  })
  it('prefixes a page and maps the homepage to the locale root', () => {
    expect(withLocalePrefix('/about', '/fr')).toBe('/fr/about')
    expect(withLocalePrefix('/', '/fr')).toBe('/fr')
  })
})

describe('breadcrumbTrail with a locale prefix', () => {
  it('localises every crumb URL but keeps the default-language trail unchanged', () => {
    const args = { collection: 'posts', baseUrl: BASE, path: '/blog/hi', title: 'Hi' }
    expect(breadcrumbTrail(args).map((c) => c.url)).toEqual([`${BASE}/`, `${BASE}/blog`, `${BASE}/blog/hi`])
    expect(breadcrumbTrail({ ...args, localePrefix: '/fr' }).map((c) => c.url)).toEqual([
      `${BASE}/fr`,
      `${BASE}/fr/blog`,
      `${BASE}/fr/blog/hi`,
    ])
  })
  it('localises page ancestors too', () => {
    const crumbs = breadcrumbTrail({
      collection: 'pages',
      baseUrl: BASE,
      path: '/a/b',
      title: 'B',
      pageTrail: [{ name: 'A', path: '/a' }],
      localePrefix: '/de',
    })
    expect(crumbs.map((c) => c.url)).toEqual([`${BASE}/de`, `${BASE}/de/a`, `${BASE}/de/a/b`])
  })
})
