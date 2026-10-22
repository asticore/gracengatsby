import { describe, expect, it } from 'vitest'

import { categoryIndex, categoryPath, paginate, parsePage, postsInCategory, termSlug } from '@/features/siteTemplates/archiveQueries'

const posts = [
  { id: 1, slug: 'a', categories: [{ name: 'News' }, { name: 'Tips & Tricks' }] },
  { id: 2, slug: 'b', categories: [{ name: 'news ' }] },
  { id: 3, slug: 'c', categories: [] },
  { id: 4, slug: 'd' },
]

describe('archive helpers', () => {
  it('indexes categories by slug, first spelling wins', () => {
    expect([...categoryIndex(posts)]).toEqual([['news', 'News'], ['tips-tricks', 'Tips & Tricks']])
  })
  it('filters posts by category slug and rejects odd slugs', () => {
    expect(postsInCategory(posts, 'news').map((p) => p.id)).toEqual([1, 2])
    expect(postsInCategory(posts, 'nope')).toEqual([])
    expect(postsInCategory(posts, '../x')).toEqual([])
    expect(termSlug('Bad Slug')).toBe('')
    expect(termSlug('ok-1')).toBe('ok-1')
  })
  it('parses page numbers defensively', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePage(['2', '5'])).toBe(2)
    for (const bad of [undefined, '', '0', '-1', 'x', '1e3', '99999999']) expect(parsePage(bad)).toBe(1)
  })
  it('paginates and clamps', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(paginate(items, 1, 9)).toMatchObject({ page: 1, pages: 3, total: 20, items: items.slice(0, 9) })
    expect(paginate(items, 3, 9).items).toEqual([18, 19])
    expect(paginate(items, 99, 9).page).toBe(3)
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, items: [] })
  })
  it('builds paths', () => {
    expect(categoryPath('news')).toBe('/blog/category/news')
    expect(categoryPath('news', 2)).toBe('/blog/category/news?page=2')
  })
})
