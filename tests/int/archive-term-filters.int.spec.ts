import { describe, expect, it } from 'vitest'

import { archiveQueryString, parseArchiveFilters } from '@/features/siteTemplates/archiveFilter'
import { archivePostFacets, filterArchivePosts, paginate } from '@/features/siteTemplates/archiveQueries'
import { archivePageHref } from '@/lib/templateWidgets'

type Post = {
  id: number
  slug: string
  title: string
  excerpt?: string | null
  publishedDate?: string | null
  categories?: { name: string }[] | null
  tags?: { name: string }[] | null
}

// Already in the blog's order (newest first), as the term archives receive them.
const posts: Post[] = [
  { id: 1, slug: 'c', title: 'Care for silver', excerpt: 'polishing', publishedDate: '2026-10-03', categories: [{ name: 'Care' }], tags: [{ name: 'Sale' }] },
  { id: 2, slug: 'b', title: 'Gift guide', excerpt: 'for mum', publishedDate: '2026-10-02', categories: [{ name: 'Care' }, { name: 'Gifts' }], tags: [] },
  { id: 3, slug: 'a', title: 'Ring story', excerpt: null, publishedDate: '2026-10-01', categories: [{ name: 'Care' }], tags: [{ name: 'sale' }] },
]

describe('filters on the term archives (category, tag, author)', () => {
  it('no filter params keep the archive list and order exactly', () => {
    const shown = filterArchivePosts(posts, parseArchiveFilters({}))
    expect(shown.map((p) => p.id)).toEqual([1, 2, 3])
    expect(archiveQueryString(parseArchiveFilters({}))).toBe('')
  })

  it('narrows by tag and by text, matching a case-insensitive tag slug', () => {
    expect(filterArchivePosts(posts, parseArchiveFilters({ tag: 'sale' })).map((p) => p.id)).toEqual([1, 3])
    expect(filterArchivePosts(posts, parseArchiveFilters({ q: 'gift' })).map((p) => p.id)).toEqual([2])
  })

  it('narrows by a category name and sorts by title on request', () => {
    expect(filterArchivePosts(posts, parseArchiveFilters({ category: 'gifts' })).map((p) => p.id)).toEqual([2])
    expect(filterArchivePosts(posts, parseArchiveFilters({ sort: 'title' })).map((p) => p.title)).toEqual(['Care for silver', 'Gift guide', 'Ring story'])
    expect(filterArchivePosts(posts, parseArchiveFilters({ sort: 'oldest' })).map((p) => p.id)).toEqual([3, 2, 1])
  })

  it('builds the archive base path with the active filters, and facets come from the unfiltered posts', () => {
    const filters = parseArchiveFilters({ tag: 'sale', sort: 'title' })
    expect(archiveQueryString(filters)).toBe('?tag=sale&sort=title')
    expect(archivePageHref(`/blog/tag/sale${archiveQueryString(filters)}`, 2)).toBe('/blog/tag/sale?tag=sale&sort=title&page=2')
    const facets = archivePostFacets(posts)
    expect(facets.categories.map((c) => c.slug)).toEqual(['care', 'gifts'])
    expect(facets.tags.map((t) => t.slug)).toEqual(['sale'])
  })

  it('pages the filtered list', () => {
    const paged = paginate(filterArchivePosts(posts, parseArchiveFilters({ category: 'care' })), 2, 2)
    expect(paged).toMatchObject({ page: 2, pages: 2, total: 3 })
    expect(paged.items.map((p) => p.id)).toEqual([3])
  })
})
