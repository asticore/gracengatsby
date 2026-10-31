// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildListCsv, csvField, csvQueryFromSearchParams, findColumnField } from '@/admin/list/csvExport'
import type { ColumnDef } from '@/admin/list/listQuery'

const columns: ColumnDef[] = [
  { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: false },
  { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
  { name: 'note', label: 'Note', type: 'text', sortable: false, filterable: false },
]

describe('list CSV export helpers', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, b')).toBe('"a, b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
  })

  it('stops spreadsheet formulas by prefixing a quote', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField('+1')).toBe("'+1")
    expect(csvField('-2')).toBe("'-2")
    expect(csvField('@cmd')).toBe("'@cmd")
  })

  it('writes the visible columns as a header and one line per document', () => {
    const csv = buildListCsv({
      columns,
      fields: [
        { type: 'text', name: 'title' },
        { type: 'select', name: 'status', options: [{ label: 'Published', value: 'published' }] },
        { type: 'text', name: 'note' },
      ] as never,
      docs: [
        { title: 'Hello, world', status: 'published', note: undefined },
        { title: 'Second', status: 'draft', note: 'ok' },
      ],
      formatterFor: () => undefined,
    })
    expect(csv).toBe('Title,Status,Note\r\n"Hello, world",Published,\r\nSecond,draft,ok\r\n')
  })

  it('finds fields inside layout rows but not inside groups', () => {
    const fields = [
      { type: 'row', fields: [{ type: 'text', name: 'inRow' }] },
      { type: 'group', name: 'grp', fields: [{ type: 'text', name: 'hidden' }] },
    ] as never
    expect(findColumnField(fields, 'inRow')).toBeDefined()
    expect(findColumnField(fields, 'hidden')).toBeUndefined()
  })

  it('carries the list query into the export link without paging', () => {
    const query = csvQueryFromSearchParams(
      { q: 'sale', sort: '-createdAt', page: '4', limit: '50', cols: 'title,status', f: ['status:equals:draft', 'title:contains:x'], trash: '1' },
      'pages',
    )
    const params = new URLSearchParams(query)
    expect(params.get('collection')).toBe('pages')
    expect(params.get('q')).toBe('sale')
    expect(params.get('cols')).toBe('title,status')
    expect(params.getAll('f')).toEqual(['status:equals:draft', 'title:contains:x'])
    expect(params.get('trash')).toBe('1')
    expect(params.has('page')).toBe(false)
    expect(params.has('limit')).toBe(false)
  })
})
