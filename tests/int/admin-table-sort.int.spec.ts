// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ariaSortFor, compareSortValues, nextTableSort, sortTableRows } from '@/admin/table/sortTableRows'
import { SortableTable, type SortableRow } from '@/admin/table/SortableTable'

const row = (id: string, values: Record<string, string | number | boolean | null>): SortableRow => ({
  id,
  sortValues: values,
  cells: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '-')])),
})

describe('sortTableRows', () => {
  const rows = [
    row('a', { name: 'Item 10', n: 10 }),
    row('b', { name: 'Item 2', n: null }),
    row('c', { name: 'item 1', n: 2 }),
  ]

  it('sorts strings naturally and case-insensitively, ascending and descending', () => {
    expect(sortTableRows(rows, { key: 'name', direction: 'asc' }).map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect(sortTableRows(rows, { key: 'name', direction: 'desc' }).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts numbers by value and keeps empty values last in both directions', () => {
    expect(sortTableRows(rows, { key: 'n', direction: 'asc' }).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(sortTableRows(rows, { key: 'n', direction: 'desc' }).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('keeps the given order when no sort is set and does not mutate the input', () => {
    const before = rows.map((r) => r.id)
    expect(sortTableRows(rows, null).map((r) => r.id)).toEqual(before)
    sortTableRows(rows, { key: 'name', direction: 'asc' })
    expect(rows.map((r) => r.id)).toEqual(before)
  })

  it('compares booleans as false before true', () => {
    expect(compareSortValues(false, true)).toBeLessThan(0)
    expect(compareSortValues(null, 'x')).toBeGreaterThan(0)
    expect(compareSortValues(undefined, null)).toBe(0)
  })
})

describe('sort state', () => {
  it('cycles ascending, descending, ascending when the same header is clicked', () => {
    const first = nextTableSort(null, 'name')
    expect(first).toEqual({ key: 'name', direction: 'asc' })
    const second = nextTableSort(first, 'name')
    expect(second).toEqual({ key: 'name', direction: 'desc' })
    expect(nextTableSort(second, 'name')).toEqual({ key: 'name', direction: 'asc' })
  })

  it('starts a new column ascending and reports aria-sort', () => {
    expect(nextTableSort({ key: 'name', direction: 'desc' }, 'n')).toEqual({ key: 'n', direction: 'asc' })
    expect(ariaSortFor({ key: 'name', direction: 'asc' }, 'name')).toBe('ascending')
    expect(ariaSortFor({ key: 'name', direction: 'desc' }, 'name')).toBe('descending')
    expect(ariaSortFor({ key: 'name', direction: 'asc' }, 'n')).toBe('none')
  })
})

describe('SortableTable markup', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'n', label: 'Count', align: 'right' as const },
    { key: 'actions', label: 'Actions', sortable: false },
  ]
  const rows = [row('1', { name: 'b', n: 1, actions: null }), row('2', { name: 'a', n: 2, actions: null })]

  it('renders scoped headers, a sort button on sortable columns and no button on the others', () => {
    const html = renderToStaticMarkup(React.createElement(SortableTable, { columns, rows }))
    expect(html.match(/<th[^>]*scope="col"/g)?.length).toBe(3)
    expect(html.match(/class="sortable-table__button"/g)?.length).toBe(2)
    expect(html).toContain('aria-sort="none"')
    expect(html).not.toMatch(/<th[^>]*aria-sort[^>]*>\s*<\/th>/)
  })

  it('applies the default sort in the first render and marks that header', () => {
    const html = renderToStaticMarkup(
      React.createElement(SortableTable, { columns, rows, defaultSort: { key: 'name', direction: 'asc' } }),
    )
    expect(html).toContain('aria-sort="ascending"')
    expect(html.indexOf('>a</td>')).toBeLessThan(html.indexOf('>b</td>'))
  })
})
