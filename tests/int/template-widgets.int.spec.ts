import { describe, expect, it } from 'vitest'

import { setBlockContext } from '@/lib/blockContext'
import { ARCHIVE_PAGE_SIZE, paginate, parsePage } from '@/features/siteTemplates/archiveQueries'
import { ArchiveGridElement } from '@/components/blocks/elements/Wave63Server'
import { WAVE63_ELEMENTS } from '@/lib/elements/wave63Defs'
import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'
import { archivePageHref, buildBreadcrumbs, formatPostMeta } from '@/lib/templateWidgets'

describe('buildBreadcrumbs', () => {
  it('builds home plus segments with the title on the last', () => {
    expect(buildBreadcrumbs('/blog/my-post', 'My Post')).toEqual([
      { label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'My Post', href: '/blog/my-post' },
    ])
  })
  it('handles empty, query strings and custom home label', () => {
    expect(buildBreadcrumbs(undefined)).toEqual([{ label: 'Home', href: '/' }])
    expect(buildBreadcrumbs('/shop/red-hat?x=1', '', 'Start').map((c) => c.label)).toEqual(['Start', 'Shop', 'Red Hat'])
  })
})

describe('formatPostMeta', () => {
  const post = { author: 'Jo', date: '2026-10-20T00:00:00Z', categories: ['News', 'Tips'] }
  it('includes only toggled parts', () => {
    expect(formatPostMeta(post, { author: true, categories: true })).toEqual(['By Jo', 'News, Tips'])
    expect(formatPostMeta(post, {})).toEqual([])
  })
  it('formats the date and skips missing data', () => {
    expect(formatPostMeta(post, { date: true, dateFormat: 'long' })[0]).toContain('2026')
    expect(formatPostMeta({}, { author: true, date: true, categories: true })).toEqual([])
  })
})

describe('archive paging', () => {
  it('leaves page 1 at the bare address and adds ?page= (or &page= after a query) from page 2', () => {
    expect(archivePageHref('/blog', 1)).toBe('/blog')
    expect(archivePageHref('/blog', 2)).toBe('/blog?page=2')
    expect(archivePageHref('/shop?category=homeware', 3)).toBe('/shop?category=homeware&page=3')
  })
  it('clamps pages and reads a bad page as page 1', () => {
    const items = Array.from({ length: ARCHIVE_PAGE_SIZE + 1 }, (_, i) => i)
    expect(paginate(items, 2).items).toEqual([ARCHIVE_PAGE_SIZE])
    expect(paginate(items, 99).page).toBe(2)
    expect(parsePage('abc')).toBe(1)
  })
})

describe('archive-grid widget', () => {
  it('is registered as a server site element with a default', () => {
    expect(WAVE63_ELEMENTS.some((e) => e.type === 'archive-grid')).toBe(true)
    expect(SITE_ELEMENT_TYPES.has('archive-grid')).toBe(true)
  })
  it('renders nothing outside an archive', async () => {
    setBlockContext({ path: '/blog/x' })
    expect(await ArchiveGridElement({})).toBeNull()
  })
})
