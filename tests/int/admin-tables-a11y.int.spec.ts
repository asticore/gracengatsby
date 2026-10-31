// @vitest-environment node
/**
 * Lightweight accessibility check for the key admin tables (no browser, no axe): every table
 * has a head with scoped column headers, sortable headers are real buttons with aria-sort, and
 * no header is empty unless it is an actions column. Full axe runs need a browser and are
 * tracked separately in remaining-work.md, Task 5.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SortableTable } from '@/admin/table/SortableTable'
import { ReviewQueueTable } from '@/features/approval/views/ReviewQueueTable'
import type { ReviewQueueRow } from '@/features/approval/handlers'

function headers(html: string): string[] {
  return html.match(/<th\b[^>]*>[\s\S]*?<\/th>/g) ?? []
}

describe('admin tables: structure for assistive technology', () => {
  it('SortableTable: every header is scoped, sortable headers are buttons with aria-sort, tbody exists', () => {
    const html = renderToStaticMarkup(
      React.createElement(SortableTable, {
        columns: [
          { key: 'a', label: 'Alpha' },
          { key: 'b', label: 'Beta', align: 'right' },
          { key: 'x', label: '', sortable: false },
        ],
        rows: [{ id: '1', sortValues: { a: 'x', b: 2 }, cells: { a: 'x', b: '2' } }],
        caption: 'Test table',
      }),
    )
    expect(html).toContain('<thead>')
    expect(html).toContain('<tbody>')
    expect(html).toContain('<caption>Test table</caption>')
    const ths = headers(html)
    expect(ths).toHaveLength(3)
    for (const th of ths) expect(th).toContain('scope="col"')
    expect(html.match(/<th[^>]*aria-sort="none"[^>]*><button type="button"/g)?.length).toBe(2)
    expect(ths[2]).not.toContain('aria-sort')
    expect(ths[2]).not.toContain('<button')
  })

  it('ReviewQueueTable: headers are scoped and each sortable header is a button', () => {
    const rows: ReviewQueueRow[] = [
      { collection: 'pages', id: 1, title: 'About', requestedBy: 'editor@example.com', requestedAt: '2026-10-01T10:00:00.000Z', href: '/admin/pages/1' },
      { collection: 'posts', id: 2, title: 'News', requestedBy: 'writer@example.com', requestedAt: null, href: '/admin/posts/2' },
    ]
    const html = renderToStaticMarkup(React.createElement(ReviewQueueTable, { rows }))
    const ths = headers(html)
    expect(ths).toHaveLength(4)
    for (const th of ths) {
      expect(th).toContain('scope="col"')
      expect(th).toContain('<button type="button"')
    }
    expect(html).toContain('href="/admin/pages/1"')
  })
})
