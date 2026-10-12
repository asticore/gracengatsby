// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { FieldGroupDoc } from '@/fields/customFields/types'

const loadMock = vi.hoisted(() => ({ loadDataView: vi.fn() }))
const accessMock = vi.hoisted(() => ({ canReadPrivateViews: vi.fn(async () => false), adminCan: vi.fn(async () => true) }))
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/features/dataViews/load', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadDataView: loadMock.loadDataView }
})
vi.mock('@/features/dataViews/access', () => accessMock)
vi.mock('next/navigation', () => ({ notFound: nav.notFound }))

import { buildCatalogue, isSelectableCustomField, SOURCE_COLLECTIONS } from '@/features/dataViews/catalogue'
import { buildChart, niceScale, prepareSeries } from '@/features/dataViews/chart'
import { defaultChart, defaultDisplay, normalizeConfig, normalizeDataView, normalizeSlug } from '@/features/dataViews/config'
import { ChartSvg } from '@/features/dataViews/components/ChartSvg'
import { DataTable } from '@/features/dataViews/components/DataTable'
import { DataViewView } from '@/features/dataViews/components/DataViewView'
import { guardFormula, iframeSnippet, mergeTagFor, shortcodeFor, toCsvBody, toJsonBody } from '@/features/dataViews/embed'
import { compareCells, matchesRule } from '@/features/dataViews/filter'
import { formatCell } from '@/features/dataViews/format'
import { gridRows } from '@/features/dataViews/grid'
import { isPublicDocument, resolveTableData, type ResolveDeps } from '@/features/dataViews/resolve'
import { hasViewShortcode, splitViewShortcodes, viewRefFromText } from '@/features/dataViews/shortcode'
import { DATA_VIEW_TTL_MS, invalidateDataViewCache, noteDocumentChanged, readCachedView, writeCachedView } from '@/features/dataViews/cache'
import { DataViews } from '@/features/dataViews/collections/DataViews'
import { validateDataView } from '@/features/dataViews/validate'
import { LIMITS, type DataViewDef, type DataViewModel, type TableData } from '@/features/dataViews/types'
import { DEFAULT_SECURITY_SETTINGS } from '@/features/security'
import { isFrameablePath, securityHeaders } from '@/features/security/headers'
import { BUILT_IN_ROLES, PERMISSION_CATEGORIES, RESOURCES, can } from '@/features/roles/permissions'
import { collectionConfigs, readRegistry, writeRegistry } from '@/localapi/registry'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'
import { ELEMENTS, getElementDef } from '@/lib/elements/registry'
import { GET as dataGET } from '@/app/(engage)/api/data-view/[file]/route'
import EmbedDataPage from '@/app/(embed)/embed/data/[ref]/page'

const def = (patch: Partial<DataViewDef> = {}): DataViewDef => ({
  ...normalizeDataView({ id: 7, title: 'Test', kind: 'table', source: 'custom-fields', isPublic: true, config: {} }),
  ...patch,
})

const group = (fields: Record<string, unknown>[], location: unknown = [[{ param: 'collection', operator: 'equals', value: 'products' }]]): FieldGroupDoc =>
  ({ id: 1, name: 'Specs', fields, location } as unknown as FieldGroupDoc)

const GROUPS: FieldGroupDoc[] = [
  group([
    { name: 'colour', label: 'Colour', type: 'text' },
    { name: 'weight_kg', label: 'Weight (kg)', type: 'number' },
    { name: 'release', label: 'Release date', type: 'date' },
    { name: '_cost', label: 'Cost price', type: 'number' },
    { name: 'photo', label: 'Photo', type: 'image' },
    { name: 'tags', label: 'Tags', type: 'select', multiple: true },
    { name: 'extra', label: 'Extra', type: 'text', conditions: [[{ field: 'colour', operator: 'equals', value: 'Red' }]] },
  ]),
]

const doc = (id: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  _status: 'published',
  title: `Product ${id}`,
  slug: `p-${id}`,
  priceInAUD: id * 10,
  stockQty: 999,
  customFields: { colour: id % 2 ? 'Red' : 'Blue', weight_kg: id, _cost: 5, extra: 'only-when-red' },
  ...extra,
})

const deps = (docs: Record<string, unknown>[], protectedIds: number[] = []): ResolveDeps => ({
  findDocs: vi.fn(async () => docs),
  loadGroups: vi.fn(async () => GROUPS),
  protectedIds: vi.fn(async () => new Set(protectedIds)),
})

describe('normalisation', () => {
  it('survives junk and keeps everything bounded', () => {
    const config = normalizeConfig('{"columns":[{"key":"title"},{"key":"bad key!"},7],"data":{"collection":"users; drop","limit":99999,"filters":[{"field":"title","operator":"sql","value":"x"}]},"display":{"pageSize":-3}}')
    expect(config.columns.map((c) => c.key)).toEqual(['title'])
    expect(config.data.collection).toBe('pages')
    expect(config.data.limit).toBe(LIMITS.maxRows)
    expect(config.data.filters).toEqual([])
    expect(config.display.pageSize).toBe(0)
    expect(normalizeConfig(null).chart).toEqual(defaultChart())
    expect(normalizeConfig(42).display).toEqual(defaultDisplay())
  })
  it('normalises slugs and refuses purely numeric ones', () => {
    expect(normalizeSlug(' Sales By Month! ')).toBe('sales-by-month')
    expect(normalizeSlug('123')).toBeNull()
    expect(normalizeSlug(7)).toBeNull()
    expect(normalizeSlug('')).toBeNull()
  })
  it('falls back on bad kind and source', () => {
    const view = normalizeDataView({ id: 'x', kind: 'nope', source: 'sql', title: '', config: '{' })
    expect(view.kind).toBe('table')
    expect(view.source).toBe('custom-fields')
    expect(view.title).toBe('Untitled')
    expect(view.id).toBe(0)
  })
})

describe('field catalogue (what may be selected)', () => {
  it('offers friendly labels and never offers fields outside the allow-list', () => {
    const keys = buildCatalogue('products', GROUPS).map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('priceInAUD')
    expect(keys).toContain('cf:colour')
    expect(keys).not.toContain('stockQty')
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('password')
    expect(buildCatalogue('products', GROUPS).find((f) => f.key === 'cf:weight_kg')?.label).toBe('Weight (kg)')
  })
  it('excludes private (underscore), media, multi-value and non-value custom fields', () => {
    const keys = buildCatalogue('products', GROUPS).map((f) => f.key)
    expect(keys).not.toContain('cf:_cost')
    expect(keys).not.toContain('cf:photo')
    expect(keys).not.toContain('cf:tags')
    expect(isSelectableCustomField({ name: 'g', label: 'g', type: 'group' } as never)).toBe(false)
    expect(isSelectableCustomField({ name: 'a b', label: 'a', type: 'text' } as never)).toBe(false)
  })
  it('only offers custom fields from groups that apply to the collection', () => {
    expect(buildCatalogue('pages', GROUPS).map((f) => f.key)).not.toContain('cf:colour')
    expect(buildCatalogue('nonsense', GROUPS)).toEqual([])
    expect(buildCatalogue('users', GROUPS)).toEqual([])
  })
  it('lists only collections that carry Extra fields', () => {
    expect(SOURCE_COLLECTIONS.map((c) => c.slug).sort()).toEqual(['events', 'faqs', 'pages', 'posts', 'products'])
  })
})

describe('filters are data, never queries', () => {
  it('matches with each safe operator', () => {
    const r = (operator: string, value: string) => ({ field: 'x', operator: operator as never, value })
    expect(matchesRule('Red wine', r('contains', 'red'), 'text')).toBe(true)
    expect(matchesRule('Red wine', r('notContains', 'red'), 'text')).toBe(false)
    expect(matchesRule(10, r('greater', '9'), 'number')).toBe(true)
    expect(matchesRule('10', r('lessOrEqual', '10'), 'number')).toBe(true)
    expect(matchesRule(null, r('greater', '1'), 'number')).toBe(false)
    expect(matchesRule('abc', r('greater', '1'), 'number')).toBe(false)
    expect(matchesRule('2026-02-01', r('greaterOrEqual', '2026-01-01'), 'date')).toBe(true)
    expect(matchesRule('b', r('in', 'a, B ,c'), 'text')).toBe(true)
    expect(matchesRule('', r('isEmpty', ''), 'text')).toBe(true)
    expect(matchesRule('x', r('notEmpty', ''), 'text')).toBe(true)
    expect(matchesRule('x', r('equals', 'X'), 'text')).toBe(true)
    expect(matchesRule(5, r('equals', '5.0'), 'number')).toBe(true)
  })
  it('treats a hostile value as plain text', () => {
    expect(matchesRule("x' OR 1=1 --", { field: 'x', operator: 'equals', value: "x' OR 1=1 --" }, 'text')).toBe(true)
    expect(matchesRule('safe', { field: 'x', operator: 'equals', value: "' OR 1=1 --" }, 'text')).toBe(false)
  })
  it('keeps empty values last and numbers numeric', () => {
    expect(compareCells(null, 3, 'number')).toBeGreaterThan(0)
    expect(compareCells(9, 10, 'number')).toBeLessThan(0)
    expect(compareCells('a', 'B', 'text')).toBeLessThan(0)
  })
  it('drops rules that name fields outside the catalogue or use unknown operators', () => {
    const config = normalizeConfig({ data: { filters: [{ field: 'x', operator: 'sql', value: '1' }, { field: 'stockQty', operator: 'equals', value: '1' }, { field: 'a b', operator: 'equals', value: '1' }] } })
    expect(config.data.filters.map((f) => f.field)).toEqual(['stockQty'])
  })
})

describe('resolving a custom-fields view', () => {
  const base = (patch: Partial<DataViewDef>) =>
    def({
      data: { collection: 'products', category: '', filters: [], sort: null, limit: 50 },
      columns: [
        { key: 'title', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
        { key: 'cf:colour', label: 'Colour', format: 'auto', decimals: -1, currency: 'AUD' },
        { key: 'cf:weight_kg', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
      ],
      ...patch,
    })

  it('builds columns with friendly labels and typed values', async () => {
    const data = await resolveTableData(base({}), deps([doc(1), doc(2)]))
    expect(data.columns.map((c) => c.label)).toEqual(['Name', 'Colour', 'Weight (kg)'])
    expect(data.columns[2]!.type).toBe('number')
    expect(data.rows[0]).toEqual(['Product 1', 'Red', 1])
  })
  it('never includes drafts, members-only or password protected documents', async () => {
    const docs = [doc(1), doc(2, { _status: 'draft' }), doc(3, { membersOnly: { enabled: true } }), doc(4), doc(5, { _status: undefined })]
    const data = await resolveTableData(base({}), deps(docs, [4]))
    expect(data.rows.map((r) => r[0])).toEqual(['Product 1'])
    expect(isPublicDocument('faqs', { id: 1 }, new Set())).toBe(true)
    expect(isPublicDocument('pages', { id: 1 }, new Set())).toBe(false)
    expect(isPublicDocument('unknown', { id: 1, _status: 'published' }, new Set())).toBe(false)
  })
  it('refuses hidden and private fields even when a stored view names them', async () => {
    const data = await resolveTableData(
      base({
        columns: [
          { key: 'stockQty', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
          { key: 'cf:_cost', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
          { key: 'cf:photo', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
          { key: 'title', label: '', format: 'auto', decimals: -1, currency: 'AUD' },
        ],
      }),
      deps([doc(1)]),
    )
    expect(data.columns.map((c) => c.key)).toEqual(['title'])
    expect(JSON.stringify(data.rows)).not.toContain('999')
  })
  it('hides values of fields whose conditions are not met', async () => {
    const view = base({ columns: [{ key: 'cf:extra', label: '', format: 'auto', decimals: -1, currency: 'AUD' }] })
    // The group in GROUPS has no `extra` as selectable condition holder, so check both docs.
    const data = await resolveTableData(view, deps([doc(1), doc(2)]))
    expect(data.columns.map((c) => c.key)).toEqual(['cf:extra'])
    expect(data.rows).toEqual([['only-when-red'], [null]])
  })
  it('ignores filters and sorts that name fields outside the catalogue', async () => {
    const data = await resolveTableData(
      base({ data: { collection: 'products', category: '', filters: [{ field: 'stockQty', operator: 'equals', value: '999' }, { field: 'cf:_cost', operator: 'equals', value: '5' }], sort: { key: 'password', direction: 'asc' }, limit: 50 } }),
      deps([doc(1), doc(2)]),
    )
    expect(data.rows).toHaveLength(2)
  })
  it('filters, sorts and limits', async () => {
    const docs = [doc(1), doc(2), doc(3), doc(4)]
    const data = await resolveTableData(
      base({ data: { collection: 'products', category: '', filters: [{ field: 'cf:colour', operator: 'equals', value: 'Red' }], sort: { key: 'cf:weight_kg', direction: 'desc' }, limit: 1 } }),
      deps(docs),
    )
    expect(data.rows).toEqual([['Product 3', 'Red', 3]])
    expect(data.truncated).toBe(true)
  })
  it('returns nothing for a collection that cannot be used', async () => {
    const data = await resolveTableData(def({ data: { collection: 'users', category: '', filters: [], sort: null, limit: 5 } }), deps([doc(1)]))
    expect(data.rows).toEqual([])
    expect(data.columns).toEqual([])
  })
  it('falls back to the first field when no columns are chosen', async () => {
    const data = await resolveTableData(base({ columns: [] }), deps([doc(1)]))
    expect(data.columns.map((c) => c.key)).toEqual(['title'])
  })
})

describe('resolving typed-in and imported data', () => {
  it('reads a grid with a heading row and infers number columns', async () => {
    const view = def({ source: 'manual', grid: { headerRow: true, rows: [['Month', 'Sales'], ['Jan', '1,200'], ['Feb', '1500'], ['', '']] } })
    const data = await resolveTableData(view, deps([]))
    expect(data.columns.map((c) => [c.label, c.type])).toEqual([['Month', 'text'], ['Sales', 'number']])
    expect(data.rows).toEqual([['Jan', 1200], ['Feb', 1500]])
  })
  it('reads imported CSV, applies column overrides and a sort', async () => {
    const view = def({
      source: 'csv',
      csvText: 'Item,Price\nTea,3.5\nCoffee,4\nWater,1',
      columns: [{ key: 'c1', label: 'Cost', format: 'currency', decimals: 2, currency: 'USD' }, { key: 'c0', label: '', format: 'auto', decimals: -1, currency: 'AUD' }],
      data: { collection: 'pages', category: '', filters: [], sort: { key: 'c1', direction: 'desc' }, limit: 50 },
    })
    const data = await resolveTableData(view, deps([]))
    expect(data.columns.map((c) => c.label)).toEqual(['Cost', 'Item'])
    expect(data.rows.map((r) => r[1])).toEqual(['Coffee', 'Tea', 'Water'])
    expect(formatCell(data.rows[0]![0]!, data.columns[0]!)).toContain('4.00')
  })
  it('lists grid headers for the editor', () => {
    expect(gridRows({ source: 'manual', csvText: '', grid: { headerRow: false, rows: [['1', '2']] } }).headers).toEqual(['Column 1', 'Column 2'])
  })
})

describe('formatting', () => {
  const col = (patch: Record<string, unknown>) => ({ type: 'number' as const, format: 'auto' as const, decimals: -1, currency: 'AUD', ...patch }) as never
  it('formats numbers, currency, percent and dates', () => {
    expect(formatCell(1234.5, col({}))).toBe('1,234.5')
    expect(formatCell(1234.5, col({ format: 'currency' }))).toMatch(/1,234\.50/)
    expect(formatCell(12, col({ format: 'percent' }))).toBe('12%')
    expect(formatCell('2026-03-04', col({ type: 'date', format: 'date' }))).toMatch(/2026/)
    expect(formatCell('not a number', col({ format: 'number' }))).toBe('not a number')
    expect(formatCell(null, col({}))).toBe('')
  })
})

const model = (patch: Partial<DataViewModel['view']> = {}, data?: Partial<TableData>): DataViewModel => ({
  view: { id: 7, title: 'Sales', slug: 'sales', kind: 'table', display: defaultDisplay(), chart: defaultChart(), ...patch },
  data: {
    columns: [
      { key: 'c0', label: 'Month', type: 'text', format: 'auto', decimals: -1, currency: 'AUD' },
      { key: 'c1', label: 'Sales', type: 'number', format: 'auto', decimals: -1, currency: 'AUD' },
      { key: 'c2', label: 'Costs', type: 'number', format: 'auto', decimals: -1, currency: 'AUD' },
    ],
    rows: [['Jan', 10, 4], ['Feb', 20, 5], ['Mar', 15, 6]],
    truncated: false,
    ...data,
  },
})

describe('table rendering', () => {
  it('renders an accessible table with caption, column and row headers', () => {
    const html = renderToStaticMarkup(React.createElement(DataTable, { model: model({ display: { ...defaultDisplay(), caption: 'Monthly sales', totalsRow: true, footerRow: true } }) }))
    expect(html).toContain('<caption>Monthly sales</caption>')
    expect(html).toContain('<th scope="col"')
    expect(html).toContain('<th scope="row"')
    expect(html).toContain('<tfoot>')
    expect(html).toContain('Total')
    expect(html).toContain('45')
  })
  it('marks sortable headings and sets page size for the script', () => {
    const html = renderToStaticMarkup(React.createElement(DataTable, { model: model({ display: { ...defaultDisplay(), pageSize: 2, searchable: true } }) }))
    expect(html).toContain('data-dv-pagesize="2"')
    expect(html).toContain('data-dv-search="1"')
    expect(html).toContain('data-sort-col="1"')
  })
  it('escapes cell text, headings and captions', () => {
    const html = renderToStaticMarkup(
      React.createElement(DataTable, {
        model: model({ display: { ...defaultDisplay(), caption: '<img src=x onerror=alert(1)>' } }, {
          columns: [{ key: 'c0', label: '<b>Name</b>', type: 'text', format: 'auto', decimals: -1, currency: 'AUD' }],
          rows: [['<script>alert(1)</script>']],
        }),
      }),
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>Name</b>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('shows a note for an empty table', () => {
    expect(renderToStaticMarkup(React.createElement(DataTable, { model: model({}, { rows: [] }) }))).toContain('Nothing to show yet.')
  })
})

describe('chart model and SVG', () => {
  it('builds bars, lines, areas, pies and scatter from the same data', () => {
    const data = model().data
    for (const kind of ['bar', 'line', 'area'] as const) {
      const built = buildChart(kind, data, { ...defaultChart(), x: 'c0', y: ['c1', 'c2'] })
      expect(built.type).toBe('cartesian')
    }
    expect(buildChart('pie', data, { ...defaultChart(), x: 'c0', y: ['c1'] }).type).toBe('pie')
    expect(buildChart('doughnut', data, defaultChart()).type).toBe('pie')
    expect(buildChart('scatter', data, { ...defaultChart(), x: 'c1', y: ['c2'] }).type).toBe('scatter')
    expect(buildChart('bar', { ...data, rows: [] }, defaultChart()).type).toBe('empty')
  })
  it('stacks bars and keeps all numbers finite', () => {
    const built = buildChart('bar', model().data, { ...defaultChart(), x: 'c0', y: ['c1', 'c2'], stacked: true })
    if (built.type !== 'cartesian') throw new Error('expected cartesian')
    expect(built.bars).toHaveLength(6)
    for (const bar of built.bars) for (const n of [bar.x, bar.y, bar.width, bar.height]) expect(Number.isFinite(n)).toBe(true)
  })
  it('aggregates by count and splits by series', () => {
    const data: TableData = {
      columns: [
        { key: 'a', label: 'Colour', type: 'text', format: 'auto', decimals: -1, currency: 'AUD' },
        { key: 'b', label: 'Size', type: 'text', format: 'auto', decimals: -1, currency: 'AUD' },
      ],
      rows: [['Red', 'S'], ['Red', 'M'], ['Blue', 'S']],
      truncated: false,
    }
    const prepared = prepareSeries(data, { ...defaultChart(), x: 'a', aggregate: 'count', seriesBy: 'b' })
    expect(prepared.categories).toEqual(['Red', 'Blue'])
    expect(prepared.series.map((s) => s.name)).toEqual(['S', 'M'])
    expect(prepared.series[0]!.values).toEqual([1, 1])
  })
  it('draws a single full slice and negative-only data without breaking', () => {
    const one = buildChart('pie', model({}, { rows: [['Only', 5, 1]] }).data, { ...defaultChart(), x: 'c0', y: ['c1'] })
    expect(one.type).toBe('pie')
    const none = buildChart('pie', model({}, { rows: [['A', -5, 1]] }).data, { ...defaultChart(), x: 'c0', y: ['c1'] })
    expect(none.type).toBe('empty')
  })
  it('gives nice axis scales', () => {
    const scale = niceScale(0, 47)
    expect(scale.min).toBe(0)
    expect(scale.max).toBeGreaterThanOrEqual(47)
    expect(niceScale(5, 5).ticks.length).toBeGreaterThan(1)
  })
  it('escapes every piece of text in the SVG and builds paths from numbers only', () => {
    const evil = '"><script>alert(1)</script>'
    const data: TableData = {
      columns: [
        { key: 'a', label: evil, type: 'text', format: 'auto', decimals: -1, currency: 'AUD' },
        { key: 'b', label: evil, type: 'number', format: 'auto', decimals: -1, currency: 'AUD' },
      ],
      rows: [[evil, 3], ['b&c', 4]],
      truncated: false,
    }
    for (const kind of ['bar', 'line', 'area', 'pie', 'doughnut'] as const) {
      const built = buildChart(kind, data, { ...defaultChart(), x: 'a', y: ['b'], xTitle: evil, yTitle: evil, dataLabels: true })
      const html = renderToStaticMarkup(React.createElement(ChartSvg, { model: built, label: evil, showLegend: true }))
      expect(html, kind).not.toContain('<script')
      expect(html, kind).toContain('&lt;script&gt;')
      for (const match of html.matchAll(/ d="([^"]*)"/g)) expect(match[1], kind).toMatch(/^[MLCAZ0-9 .\-]+$/)
    }
  })
  it('renders charts with a hidden data table and the table kind without an svg', () => {
    const chart = renderToStaticMarkup(React.createElement(DataViewView, { model: model({ kind: 'bar', chart: { ...defaultChart(), x: 'c0', y: ['c1'] } }), enhance: false }))
    expect(chart).toContain('<svg')
    expect(chart).toContain('role="img"')
    expect(chart).toContain('<table')
    expect(renderToStaticMarkup(React.createElement(DataViewView, { model: model(), enhance: false }))).not.toContain('<svg')
  })
})

describe('shortcodes', () => {
  it('recognises the bracket and merge tag forms only when alone', () => {
    expect(viewRefFromText('[data-view id="3"]')).toBe('3')
    expect(viewRefFromText(' [data-view slug=sales-by-month] ')).toBe('sales-by-month')
    expect(viewRefFromText('{{data-view:Sales}}')).toBe('sales')
    expect(viewRefFromText('see [data-view id="3"] here')).toBeNull()
    expect(viewRefFromText('[data-view id="3;drop"]')).toBeNull()
  })
  it('splits rich text around shortcode paragraphs', () => {
    const p = (text: string) => ({ type: 'paragraph', children: [{ type: 'text', text }] })
    const nodes = [p('Intro'), p('[data-view id="3"]'), p('Outro'), { type: 'heading', children: [{ text: '{{data-view:x}}' }] }]
    expect(hasViewShortcode(nodes)).toBe(true)
    const parts = splitViewShortcodes(nodes)
    expect(parts.map((s) => s.type)).toEqual(['nodes', 'view', 'nodes'])
    expect(hasViewShortcode([p('plain')])).toBe(false)
  })
  it('builds the shortcode and merge tag for a link name or id', () => {
    expect(shortcodeFor('12')).toBe('[data-view id="12"]')
    expect(shortcodeFor('sales')).toBe('[data-view slug="sales"]')
    expect(mergeTagFor('sales')).toBe('{{data-view:sales}}')
  })
})

describe('embed and export', () => {
  it('builds an iframe with a resize listener and escapes attributes', () => {
    const html = iframeSnippet('https://site.test/', 'sales', { title: 'A "quoted" <title>', height: 5000 })
    expect(html).toContain('src="https://site.test/embed/data/sales"')
    expect(html).toContain('title="A &quot;quoted&quot; &lt;title&gt;"')
    expect(html).toContain('height="2000"')
    expect(html).toContain('eg-data-view-resize')
    expect(html).toContain('e.source')
  })
  it('exports CSV and JSON from the resolved rows and guards formulas', () => {
    const m = model({}, { rows: [['=HYPERLINK("x")', -12.5, 4], ['Feb, "q"', 20, null]] })
    const csv = toCsvBody(m)
    expect(csv.split('\r\n')[0]).toBe('Month,Sales,Costs')
    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv).toContain('-12.5')
    expect(csv).toContain('"Feb, ""q"""')
    expect(guardFormula('+1 555')).toBe("'+1 555")
    expect(guardFormula('-3')).toBe('-3')
    const json = toJsonBody(m)
    expect(json.columns.map((c) => c.key)).toEqual(['c0', 'c1', 'c2'])
    expect(json.rows[1]).toEqual({ c0: 'Feb, "q"', c1: 20, c2: null })
  })
})

describe('cache invalidation', () => {
  beforeEach(() => invalidateDataViewCache())
  it('serves a cached copy until the source collection changes', () => {
    writeCachedView('k', 'products', { a: 1 }, 1000)
    expect(readCachedView('k', 'products', 2000)).toEqual({ a: 1 })
    noteDocumentChanged('products')
    expect(readCachedView('k', 'products', 2000)).toBeUndefined()
  })
  it('ignores changes to unrelated collections', () => {
    writeCachedView('k', 'products', 1, 1000)
    noteDocumentChanged('posts')
    noteDocumentChanged('audit-log')
    expect(readCachedView('k', 'products', 1500)).toBe(1)
  })
  it('drops everything when a view or an Extra fields set changes, and after the TTL', () => {
    writeCachedView('a', null, 1, 1000)
    writeCachedView('b', 'pages', 2, 1000)
    noteDocumentChanged('field-groups')
    expect(readCachedView('a', null, 1100)).toBeUndefined()
    expect(readCachedView('b', 'pages', 1100)).toBeUndefined()
    writeCachedView('c', null, 3, 1000)
    expect(readCachedView('c', null, 1000 + DATA_VIEW_TTL_MS + 1)).toBeUndefined()
    writeCachedView('d', null, 4, 1000)
    noteDocumentChanged('data-views')
    expect(readCachedView('d', null, 1001)).toBeUndefined()
  })
  it('is called by the engine write path', async () => {
    const source = (await import('node:fs')).readFileSync('src/localapi/operations.ts', 'utf8')
    expect(source.match(/noteDocumentChanged\(collection\.slug\)/g)).toHaveLength(3)
  })
})

describe('validation on save', () => {
  it('flags unknown columns, filters and sorts against the catalogue', () => {
    const view = def({
      data: { collection: 'products', category: '', filters: [{ field: 'stockQty', operator: 'equals', value: '1' }], sort: { key: 'secret', direction: 'asc' }, limit: 10 },
      columns: [{ key: 'cf:_cost', label: '', format: 'auto', decimals: -1, currency: 'AUD' }],
    })
    const problems = validateDataView(view, GROUPS)
    expect(problems.join(' ')).toMatch(/cannot be used/)
    expect(problems.length).toBeGreaterThanOrEqual(3)
  })
  it('wants a column and a real collection, and a non-numeric link name', () => {
    expect(validateDataView(def({ columns: [] }), GROUPS)).toContain('Choose at least one column to show.')
    expect(validateDataView(def({ data: { collection: 'users', category: '', filters: [], sort: null, limit: 5 } }), GROUPS)[0]).toMatch(/Choose where/)
    expect(validateDataView(def({ source: 'manual', slug: null }), null, '123')[0]).toMatch(/link name/)
    expect(validateDataView(def({ source: 'manual' }), null)).toEqual([])
  })
})

describe('collection wiring and permissions', () => {
  it('is registered for reads, writes and the engine config with role based access', () => {
    expect(readRegistry.collections['data-views']).toBeDefined()
    expect(writeRegistry.collections['data-views']).toBeDefined()
    expect(collectionConfigs).toContain(DataViews)
    expect(DataViews.labels?.plural).toBe('Tables and charts')
    expect(DataViews.admin?.group).toBe('Content')
    const access = (name: 'read' | 'create' | 'update' | 'delete', user: unknown) => (DataViews.access?.[name] as unknown as (a: { req: { user: unknown } }) => unknown)({ req: { user } })
    expect(access('read', null)).toBe(false)
    expect(access('create', { roles: ['viewer'] })).toBe(false)
    expect(access('read', { roles: ['viewer'] })).toBe(true)
    expect(access('delete', { roles: ['editor'] })).toBe(true)
    expect(access('update', { roles: ['admin'] })).toBe(true)
    expect(access('update', { roles: ['customer'] })).toBe(false)
  })
  it('has a permissions row, role defaults and a place in the Content nav group', () => {
    expect(RESOURCES).toContain('data-views')
    expect(PERMISSION_CATEGORIES.flatMap((c) => c.rows).some((r) => r.resource === 'data-views' && r.label === 'Tables and charts')).toBe(true)
    expect(can({ roles: ['editor'] }, 'data-views', 'create')).toBe(true)
    expect(can({ roles: ['viewer'] }, 'data-views', 'read')).toBe(true)
    expect(can({ roles: ['viewer'] }, 'data-views', 'update')).toBe(false)
    expect(can({ roles: ['customer'] }, 'data-views', 'read')).toBe(false)
    expect(BUILT_IN_ROLES.admin['data-views']?.delete).toBe(true)
    expect(NAV_STRUCTURE.find((g) => g.label === 'Content')?.entities.some((e) => e.slug === 'data-views')).toBe(true)
  })
  it('keeps the unsaved editor field and a slug normaliser in the beforeValidate hook', async () => {
    const hook = DataViews.hooks?.beforeValidate?.[0] as unknown as (a: { data: Record<string, unknown>; originalDoc?: Record<string, unknown> }) => Promise<Record<string, unknown>>
    const out = await hook({ data: { title: 'T', kind: 'table', source: 'manual', slug: ' My View ', config: { grid: { rows: [['a']] } } } })
    expect(out.slug).toBe('my-view')
    expect((out.config as { chart: unknown }).chart).toBeDefined()
  })
})

describe('visual editor element', () => {
  it('registers a Table or chart element with a picker of saved views', () => {
    const element = getElementDef('data-view')
    expect(element?.label).toBe('Table or chart')
    expect(element?.fields[0]).toMatchObject({ name: 'view', type: 'relationship', relationTo: 'data-views' })
    expect(ELEMENTS.filter((e) => e.type === 'data-view')).toHaveLength(1)
  })
})

describe('framing', () => {
  it('allows framing of the embed page only', () => {
    const settings = { ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true }
    const embed = securityHeaders(settings, '/embed/data/sales')
    expect(embed['X-Frame-Options']).toBeUndefined()
    expect(embed['Content-Security-Policy']).toContain('frame-ancestors *')
    const other = securityHeaders(settings, '/embed/other')
    expect(other['X-Frame-Options']).toBeDefined()
    expect(other['Content-Security-Policy'] ?? '').not.toContain('frame-ancestors')
    expect(securityHeaders(settings, '/')['X-Frame-Options']).toBeDefined()
    expect(securityHeaders(settings, '/admin')['X-Frame-Options']).toBeDefined()
    expect(isFrameablePath('/embed/data/1')).toBe(true)
    expect(isFrameablePath('/embedded/data/1')).toBe(false)
  })
  it('replaces a frame-ancestors directive typed into the custom policy', () => {
    const settings = { ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true, headers: { ...DEFAULT_SECURITY_SETTINGS.headers, contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'" } }
    const csp = securityHeaders(settings, '/embed/data/1')['Content-Security-Policy']!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('frame-ancestors *')
    expect(csp).not.toContain("'none'")
    expect(securityHeaders(settings, '/')['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  })
})

describe('data endpoint and embed page access', () => {
  const ok = (isPublic: boolean) => ({ status: 'ok', def: def({ isPublic }), model: model({ kind: 'bar', chart: { ...defaultChart(), x: 'c0', y: ['c1'] } }) })
  const call = (file: string) => dataGET(new Request(`http://x/api/data-view/${file}`), { params: Promise.resolve({ file }) })

  beforeEach(() => {
    vi.clearAllMocks()
    accessMock.canReadPrivateViews.mockResolvedValue(false)
  })

  it('serves CSV and JSON for a public view with caching and CORS', async () => {
    loadMock.loadDataView.mockResolvedValue(ok(true))
    const csv = await call('sales.csv')
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(csv.headers.get('x-content-type-options')).toBe('nosniff')
    expect(csv.headers.get('access-control-allow-origin')).toBe('*')
    expect(await csv.text()).toContain('Month,Sales,Costs')
    const json = await call('7.json')
    expect(json.headers.get('content-type')).toContain('application/json')
    expect(((await json.json()) as { rows: unknown[] }).rows).toHaveLength(3)
    expect(loadMock.loadDataView).toHaveBeenCalledWith('sales', { requirePublic: true })
  })
  it('answers 404 (not 403) for a private view to the public, and for a missing one', async () => {
    loadMock.loadDataView.mockResolvedValue({ status: 'private' })
    const hidden = await call('7.csv')
    expect(hidden.status).toBe(404)
    expect(await hidden.text()).toBe('Not found')
    loadMock.loadDataView.mockResolvedValue({ status: 'not-found' })
    const missing = await call('999.csv')
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not found')
  })
  it('lets a signed-in person with read permission fetch a private view, uncached and without CORS', async () => {
    accessMock.canReadPrivateViews.mockResolvedValue(true)
    loadMock.loadDataView.mockImplementation(async (_ref: string, options: { requirePublic: boolean }) => (options.requirePublic ? { status: 'private' } : ok(false)))
    const response = await call('7.json')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
  it('rejects malformed file names without touching the database', async () => {
    expect((await call('7.xml')).status).toBe(404)
    expect((await call('.csv')).status).toBe(404)
    expect(loadMock.loadDataView).not.toHaveBeenCalled()
  })
  it('reports an error without leaking details', async () => {
    loadMock.loadDataView.mockResolvedValue({ status: 'error' })
    const response = await call('7.csv')
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Could not load this data.')
  })

  const page = (ref: string, theme?: string) => EmbedDataPage({ params: Promise.resolve({ ref }), searchParams: Promise.resolve({ theme }) })

  it('renders just the table or chart on the embed page for a public view', async () => {
    loadMock.loadDataView.mockResolvedValue(ok(true))
    const html = renderToStaticMarkup(await page('sales', 'dark'))
    expect(html).toContain('<svg')
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('eg-data-view-resize')
    expect(html).not.toContain('<header')
  })
  it('404s the embed page for a private view unless an editor opens it', async () => {
    loadMock.loadDataView.mockResolvedValue({ status: 'private' })
    await expect(page('7')).rejects.toThrow('NEXT_NOT_FOUND')
    accessMock.canReadPrivateViews.mockResolvedValue(true)
    loadMock.loadDataView.mockImplementation(async (_ref: string, options: { requirePublic: boolean }) => (options.requirePublic ? { status: 'private' } : ok(false)))
    expect(renderToStaticMarkup(await page('7'))).toContain('<svg')
  })
  it('404s the embed page for a missing view or an error', async () => {
    loadMock.loadDataView.mockResolvedValue({ status: 'not-found' })
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
    loadMock.loadDataView.mockResolvedValue({ status: 'error' })
    await expect(page('7')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('review fixes', () => {
  it('guardFormula catches formulas hidden behind leading whitespace or control characters', () => {
    expect(guardFormula(' =SUM(A1)')).toBe("' =SUM(A1)")
    expect(guardFormula(String.fromCharCode(1) + '@cmd')).toBe("'" + String.fromCharCode(1) + '@cmd')
    expect(guardFormula(String.fromCharCode(0x2028) + '+1+1')).toBe("'" + String.fromCharCode(0x2028) + '+1+1')
    expect(guardFormula('hello')).toBe('hello')
  })

  it('isPublicDocument is false for trashed documents', () => {
    expect(isPublicDocument('pages', { id: 1, _status: 'published', trashedAt: '2026-01-01' }, new Set())).toBe(false)
    expect(isPublicDocument('pages', { id: 1, _status: 'published' }, new Set())).toBe(true)
  })
})
