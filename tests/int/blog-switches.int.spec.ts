import { describe, expect, it } from 'vitest'

import { blogSwitches } from '@/features/blog/switches'
import { postBlockContext } from '@/lib/blockContextFrom'
import { locationContextFor } from '@/features/customFields/server'
import { authorIndex, tagIndex, type ArchivePost } from '@/features/siteTemplates/archiveQueries'

const post = {
  title: 'T',
  author: { displayName: 'Ann', slug: 'ann' },
  tags: [{ name: 'Alpha' }],
  categories: [] as Array<{ name: string }>,
}

describe('blogSwitches', () => {
  it('treats missing settings as on', () => {
    expect(blogSwitches(null)).toEqual({ authors: true, tags: true, authorArchives: true })
    expect(blogSwitches(undefined)).toEqual({ authors: true, tags: true, authorArchives: true })
    expect(blogSwitches({})).toEqual({ authors: true, tags: true, authorArchives: true })
    expect(blogSwitches({ showAuthors: null, showTags: null })).toEqual({ authors: true, tags: true, authorArchives: true })
  })
  it('turns each off independently', () => {
    expect(blogSwitches({ showAuthors: false })).toEqual({ authors: false, tags: true, authorArchives: false })
    expect(blogSwitches({ showTags: false })).toEqual({ authors: true, tags: false, authorArchives: true })
  })
})

describe('authorArchives', () => {
  it('is independent of the byline but never on without authors', () => {
    expect(blogSwitches({ authorArchives: false })).toEqual({ authors: true, tags: true, authorArchives: false })
    expect(blogSwitches({ showAuthors: false, authorArchives: true }).authorArchives).toBe(false)
  })
})

describe('route gating (pure)', () => {
  it('author and tag archives 404 when their switch is off', () => {
    const off = blogSwitches({ showAuthors: false, showTags: false })
    expect(off.authors || off.tags).toBe(false)
  })
  it('sitemap indexes are only used when on', () => {
    const docs = [post] as unknown as ArchivePost[]
    const sw = blogSwitches({ showAuthors: false })
    expect(sw.authors ? [...authorIndex(docs).keys()] : []).toEqual([])
    expect(sw.tags ? [...tagIndex(docs).keys()] : []).toEqual(['alpha'])
  })
})

describe('contexts', () => {
  it('post context omits author when off or hidden', () => {
    expect(postBlockContext(post, '/blog/t').post?.author).toBe('Ann')
    expect(postBlockContext(post, '/blog/t', undefined, { authors: false }).post?.author).toBeUndefined()
    expect(postBlockContext({ ...post, hideAuthor: true }, '/blog/t').post?.author).toBeUndefined()
  })
  it('location context omits tags when off', () => {
    expect(locationContextFor('posts', post).postTags).toEqual(['Alpha'])
    expect(locationContextFor('posts', post, undefined, { tags: false }).postTags).toEqual([])
  })
})
