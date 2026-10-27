// @vitest-environment node
// Admin permalinks: content collections live under /admin/content, the rest stay
// under /admin/collections, and the old content URLs redirect (pure helpers only).
import { describe, expect, it } from 'vitest'

import {
  CONTENT_COLLECTION_SLUGS,
  adminCollectionPath,
  collectionRoute,
  isContentCollection,
  legacyCollectionRedirect,
} from '@/admin/adminPaths'

describe('adminCollectionPath', () => {
  it('puts every content collection under /admin/content', () => {
    for (const slug of CONTENT_COLLECTION_SLUGS) {
      expect(adminCollectionPath(slug)).toBe(`/admin/content/${slug}`)
    }
  })

  it('keeps settings and system collections under /admin/collections', () => {
    for (const slug of ['users', 'redirects', 'forms', 'orders', 'shipping-zones', 'email-log']) {
      expect(isContentCollection(slug)).toBe(false)
      expect(adminCollectionPath(slug)).toBe(`/admin/collections/${slug}`)
    }
  })

  it('uses the given admin base route and the route-only form', () => {
    expect(adminCollectionPath('posts', '/cms')).toBe('/cms/content/posts')
    expect(collectionRoute('posts')).toBe('/content/posts')
    expect(collectionRoute('users')).toBe('/collections/users')
  })
})

describe('legacyCollectionRedirect', () => {
  it('maps old content URLs to the new path, keeping the rest and the query', () => {
    expect(legacyCollectionRedirect('/admin/collections/pages')).toBe('/admin/content/pages')
    expect(legacyCollectionRedirect('/admin/collections/posts/12')).toBe('/admin/content/posts/12')
    expect(legacyCollectionRedirect('/admin/collections/products/9/versions')).toBe('/admin/content/products/9/versions')
    expect(legacyCollectionRedirect('/admin/collections/events/create', '?draft=1')).toBe('/admin/content/events/create?draft=1')
    expect(legacyCollectionRedirect('/admin/collections/media/3/')).toBe('/admin/content/media/3/')
  })

  it('leaves non-content collections, new paths and unrelated paths alone', () => {
    expect(legacyCollectionRedirect('/admin/collections/users/1')).toBeNull()
    expect(legacyCollectionRedirect('/admin/collections/forms')).toBeNull()
    expect(legacyCollectionRedirect('/admin/content/pages/3')).toBeNull()
    expect(legacyCollectionRedirect('/admin/collectionsx/pages')).toBeNull()
    expect(legacyCollectionRedirect('/admin')).toBeNull()
  })

  it('round-trips with the helper: the redirect target is the helper path', () => {
    for (const slug of CONTENT_COLLECTION_SLUGS) {
      expect(legacyCollectionRedirect(`/admin/collections/${slug}/7`)).toBe(`${adminCollectionPath(slug)}/7`)
    }
  })
})
