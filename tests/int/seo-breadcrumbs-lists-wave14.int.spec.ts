import { describe, it, expect } from 'vitest'
import { buildPageJsonLd } from '@/features/seo/pageSchema'
import { breadcrumbList, listBreadcrumbs } from '@/features/seo/schemaNodes'

const BASE = 'https://example.com'

describe('listBreadcrumbs', () => {
  it('returns Home then the list page itself', () => {
    expect(listBreadcrumbs({ baseUrl: BASE, path: '/blog', name: 'Blog' })).toEqual([
      { name: 'Home', url: `${BASE}/` },
      { name: 'Blog', url: `${BASE}/blog` },
    ])
  })

  it('builds a two-step BreadcrumbList for each list page', () => {
    const sections = [
      { path: '/blog', name: 'Blog' },
      { path: '/events', name: 'Events' },
      { path: '/shop', name: 'Shop' },
      { path: '/courses', name: 'Courses' },
    ]
    for (const section of sections) {
      const node = breadcrumbList(listBreadcrumbs({ baseUrl: BASE, ...section }))
      expect(node).toEqual({
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: section.name, item: `${BASE}${section.path}` },
        ],
      })
    }
  })
})

describe('list page JSON-LD with breadcrumbs', () => {
  it('embeds the Home > Section trail on a CollectionPage node', () => {
    const node = buildPageJsonLd({
      collection: 'pages',
      schemaType: 'CollectionPage',
      title: 'Shop',
      url: `${BASE}/shop`,
      baseUrl: BASE,
      siteName: 'Example',
      breadcrumbs: listBreadcrumbs({ baseUrl: BASE, path: '/shop', name: 'Shop' }),
    })
    expect(node?.['@type']).toBe('CollectionPage')
    expect(node?.breadcrumb).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${BASE}/shop` },
      ],
    })
  })

  it('omits the breadcrumb when no trail is passed', () => {
    const node = buildPageJsonLd({
      collection: 'pages',
      schemaType: 'CollectionPage',
      title: 'Blog',
      url: `${BASE}/blog`,
      baseUrl: BASE,
      siteName: 'Example',
    })
    expect(node).not.toHaveProperty('breadcrumb')
  })
})
