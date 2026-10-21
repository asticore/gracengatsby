import { describe, expect, it } from 'vitest'

import { buildBreadcrumbs, formatPostMeta } from '@/lib/templateWidgets'

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
