// @vitest-environment node
// Admin permalinks: every collection lives under its menu group (/admin/<group>/<slug>),
// and the old /admin/collections/<slug> URLs redirect. Pure helpers only.
import { describe, expect, it } from 'vitest'

import { adminCollectionPath, collectionGroup, collectionRoute, isCollectionSegments, legacyCollectionRedirect } from '@/admin/adminPaths'

describe('collectionGroup', () => {
  it('uses the lower-case menu group each collection sits in', () => {
    expect(collectionGroup('pages')).toBe('content')
    expect(collectionGroup('forms')).toBe('content')
    expect(collectionGroup('products')).toBe('shop')
    expect(collectionGroup('orders')).toBe('shop')
    expect(collectionGroup('memberships')).toBe('members')
    expect(collectionGroup('courses')).toBe('courses')
    expect(collectionGroup('lessons')).toBe('courses')
    expect(collectionGroup('ad-units')).toBe('ads')
    expect(collectionGroup('redirects')).toBe('seo')
  })

  it('falls back to other for collections in no group', () => {
    expect(collectionGroup('users')).toBe('other')
    expect(collectionGroup('audit-log')).toBe('other')
    expect(collectionGroup('no-such-collection')).toBe('other')
  })
})

describe('adminCollectionPath', () => {
  it('builds the list path under the group, with an optional admin base', () => {
    expect(adminCollectionPath('pages')).toBe('/admin/content/pages')
    expect(adminCollectionPath('orders')).toBe('/admin/shop/orders')
    expect(adminCollectionPath('users')).toBe('/admin/other/users')
    expect(adminCollectionPath('posts', '/cms')).toBe('/cms/content/posts')
    expect(collectionRoute('redirects')).toBe('/seo/redirects')
  })
})

describe('isCollectionSegments', () => {
  it('matches only when the first segment is the collection own group', () => {
    expect(isCollectionSegments(['content', 'pages', '3'])).toBe(true)
    expect(isCollectionSegments(['other', 'users'])).toBe(true)
    expect(isCollectionSegments(['shop', 'pages'])).toBe(false)
    expect(isCollectionSegments(['collections', 'pages'])).toBe(false)
  })

  it('never matches settings or view paths', () => {
    expect(isCollectionSegments(['settings', 'site'])).toBe(false)
    expect(isCollectionSegments(['settings', 'security'])).toBe(false)
    expect(isCollectionSegments(['globals', 'site-settings'])).toBe(false)
    expect(isCollectionSegments(['seo-audit'])).toBe(false)
    expect(isCollectionSegments([])).toBe(false)
  })
})

describe('legacyCollectionRedirect', () => {
  it('moves every old /admin/collections/<slug> path to its group, keeping the rest and the query', () => {
    expect(legacyCollectionRedirect('/admin/collections/pages')).toBe('/admin/content/pages')
    expect(legacyCollectionRedirect('/admin/collections/posts/12')).toBe('/admin/content/posts/12')
    expect(legacyCollectionRedirect('/admin/collections/products/9/versions')).toBe('/admin/shop/products/9/versions')
    expect(legacyCollectionRedirect('/admin/collections/users/1')).toBe('/admin/other/users/1')
    expect(legacyCollectionRedirect('/admin/collections/events/create', '?draft=1')).toBe('/admin/content/events/create?draft=1')
    expect(legacyCollectionRedirect('/admin/collections/media/3/')).toBe('/admin/content/media/3/')
  })

  it('leaves new paths, views and a bare collections prefix alone', () => {
    expect(legacyCollectionRedirect('/admin/content/pages/3')).toBeNull()
    expect(legacyCollectionRedirect('/admin/collections')).toBeNull()
    expect(legacyCollectionRedirect('/admin/collectionsx/pages')).toBeNull()
    expect(legacyCollectionRedirect('/admin/settings/site')).toBeNull()
  })

  it('redirects to exactly the helper path for every collection it is given', () => {
    for (const slug of ['pages', 'orders', 'users', 'courses', 'redirects']) {
      expect(legacyCollectionRedirect(`/admin/collections/${slug}/7`)).toBe(`${adminCollectionPath(slug)}/7`)
    }
  })
})
