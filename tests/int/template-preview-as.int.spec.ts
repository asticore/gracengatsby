import { describe, expect, it } from 'vitest'

import { blockContextFor, postBlockContext, previewTextFor, productBlockContext, sampleCollectionFor } from '@/lib/blockContextFrom'

describe('template preview-as mapping', () => {
  it('maps kinds to collections', () => {
    expect(sampleCollectionFor('single-post')).toBe('posts')
    expect(sampleCollectionFor('single-product')).toBe('products')
    expect(sampleCollectionFor('single-event')).toBe('events')
    expect(sampleCollectionFor('header')).toBeNull()
  })

  it('builds post and product contexts like the live routes', () => {
    const post = postBlockContext({ title: 'Hello', publishedDate: '2026-01-02', excerpt: 'Ex', author: { name: 'Ann' }, featuredImage: { url: '/a.jpg', alt: 'A' }, categories: [{ name: 'News' }, {}] }, '/blog/hello')
    expect(post.post).toMatchObject({ title: 'Hello', author: 'Ann', categories: ['News'], featuredImage: { url: '/a.jpg', alt: 'A' } })
    expect(post.path).toBe('/blog/hello')
    const prod = productBlockContext({ id: 3, title: 'Mug', priceInAUD: 29.99 }, '/shop/mug')
    expect(prod.product).toMatchObject({ id: 3, title: 'Mug', price: 29.99 })
    expect(blockContextFor('events', { title: 'Gig', slug: 'gig' })).toMatchObject({ page: { title: 'Gig' }, event: { title: 'Gig' }, path: '/events/gig' })
  })

  it('renders sample text for widgets, null without data', () => {
    const ctx = postBlockContext({ title: 'Hello', excerpt: 'Ex', author: { name: 'Ann' } }, '/blog/hello')
    expect(previewTextFor('post-title', {}, ctx)).toBe('Hello')
    expect(previewTextFor('post-excerpt', {}, ctx)).toBe('Ex')
    expect(previewTextFor('post-meta', {}, ctx)).toContain('Ann')
    expect(previewTextFor('breadcrumbs', {}, ctx)).toBe('Home / Blog / Hello')
    expect(previewTextFor('product-price', {}, productBlockContext({ title: 'Mug', priceInAUD: 29.99 }, '/shop/mug'))).toContain('29.99')
    expect(previewTextFor('post-title', {}, null)).toBeNull()
    expect(previewTextFor('content-slot', {}, ctx)).toBeNull()
    expect(previewTextFor('post-excerpt', {}, {})).toBeNull()
  })
})
