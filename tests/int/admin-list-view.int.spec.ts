import { describe, it, expect } from 'vitest'
import {
  deriveColumns,
  parseListSearchParams,
  serializeListState,
  getListDefaults,
  resolveVisibleColumns,
  buildFindArgs,
  type ListState,
} from '@/admin/list/listQuery'
import { resolveActiveTab, VIEW_TABS, type ViewTab } from '@/admin/list/viewTabs'
import { formatCellValue } from '@/admin/list/cellFormatting'
import type { Field } from '@/engine'

describe('Admin List View', () => {
  describe('VIEW_TABS', () => {
    it('should define tabs for media (gallery and list)', () => {
      const tabs = VIEW_TABS.media
      expect(tabs).toHaveLength(2)
      expect(tabs[0].view).toBe('gallery')
      expect(tabs[1].view).toBe('list')
    })

    it('should define tabs for events (calendar and list)', () => {
      const tabs = VIEW_TABS.events
      expect(tabs).toHaveLength(2)
      expect(tabs[0].view).toBe('calendar')
      expect(tabs[1].view).toBe('list')
    })

    it('should define tabs for pages (list only)', () => {
      const tabs = VIEW_TABS.pages
      expect(tabs).toHaveLength(1)
      expect(tabs[0].view).toBe('list')
    })
  })

  describe('resolveActiveTab', () => {
    it('should return the requested tab when it exists', () => {
      const tabs: ViewTab[] = [
        { view: 'gallery', label: 'Gallery' },
        { view: 'list', label: 'List' },
      ]
      const active = resolveActiveTab(tabs, 'list')
      expect(active.view).toBe('list')
    })

    it('should return the first tab when requested view does not exist', () => {
      const tabs: ViewTab[] = [
        { view: 'gallery', label: 'Gallery' },
        { view: 'list', label: 'List' },
      ]
      const active = resolveActiveTab(tabs, 'tree')
      expect(active.view).toBe('gallery')
    })

    it('should return the first tab when no view is specified', () => {
      const tabs: ViewTab[] = [
        { view: 'list', label: 'List' },
      ]
      const active = resolveActiveTab(tabs, undefined)
      expect(active.view).toBe('list')
    })
  })

  describe('deriveColumns', () => {
    it('should include synthetic columns: id, createdAt, updatedAt', () => {
      const cols = deriveColumns([], { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('id')
      expect(names).toContain('createdAt')
      expect(names).toContain('updatedAt')
    })

    it('should include _status column when drafts is true', () => {
      const cols = deriveColumns([], { drafts: true })
      const names = cols.map((c) => c.name)
      expect(names).toContain('_status')
    })

    it('should not include _status column when drafts is false', () => {
      const cols = deriveColumns([], { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).not.toContain('_status')
    })

    it('should derive text, number, checkbox, select, and date fields', () => {
      const fields: Field[] = [
        {
          name: 'title',
          type: 'text',
          required: false,
        } as unknown as Field,
        {
          name: 'count',
          type: 'number',
          required: false,
        } as unknown as Field,
        {
          name: 'active',
          type: 'checkbox',
          required: false,
        } as unknown as Field,
        {
          name: 'status',
          type: 'select',
          options: ['draft', 'published'],
          required: false,
        } as unknown as Field,
        {
          name: 'publishedDate',
          type: 'date',
          required: false,
        } as unknown as Field,
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('title')
      expect(names).toContain('count')
      expect(names).toContain('active')
      expect(names).toContain('status')
      expect(names).toContain('publishedDate')
    })

    it('should skip hidden fields', () => {
      const fields: Field[] = [
        {
          name: 'visible',
          type: 'text',
          required: false,
        } as unknown as Field,
        {
          name: 'hidden',
          type: 'text',
          hidden: true,
          required: false,
        } as unknown as Field,
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('visible')
      expect(names).not.toContain('hidden')
    })

    it('should include createdBy and updatedBy synthetic columns', () => {
      const cols = deriveColumns([], { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('createdBy')
      expect(names).toContain('updatedBy')
    })

    it('should label createdBy and updatedBy correctly', () => {
      const cols = deriveColumns([], { drafts: false })
      const createdByCol = cols.find((c) => c.name === 'createdBy')
      const updatedByCol = cols.find((c) => c.name === 'updatedBy')
      expect(createdByCol?.label).toBe('Created by')
      expect(updatedByCol?.label).toBe('Last edited by')
    })

    it('should mark createdBy and updatedBy as not filterable or sortable', () => {
      const cols = deriveColumns([], { drafts: false })
      const createdByCol = cols.find((c) => c.name === 'createdBy')
      const updatedByCol = cols.find((c) => c.name === 'updatedBy')
      expect(createdByCol?.sortable).toBe(false)
      expect(createdByCol?.filterable).toBe(false)
      expect(updatedByCol?.sortable).toBe(false)
      expect(updatedByCol?.filterable).toBe(false)
    })
  })

  describe('parseListSearchParams', () => {
    it('should parse q, sort, page, limit, cols, and view', () => {
      const params = {
        q: 'search term',
        sort: '-createdAt',
        page: '2',
        limit: '50',
        cols: 'title,status,createdAt',
        view: 'gallery',
      }
      const state = parseListSearchParams(params)
      expect(state.q).toBe('search term')
      expect(state.sort).toBe('-createdAt')
      expect(state.page).toBe(2)
      expect(state.limit).toBe(50)
      expect(state.cols).toEqual(['title', 'status', 'createdAt'])
      expect(state.view).toBe('gallery')
    })

    it('should default to page 1 and limit 25', () => {
      const state = parseListSearchParams({})
      expect(state.page).toBe(1)
      expect(state.limit).toBe(25)
    })

    it('should ignore invalid limit values', () => {
      const state = parseListSearchParams({ limit: '30' })
      expect(state.limit).toBe(25) // Falls back to default
    })

    it('should only accept whitelisted limits', () => {
      for (const validLimit of [10, 25, 50, 100]) {
        const state = parseListSearchParams({ limit: String(validLimit) })
        expect(state.limit).toBe(validLimit)
      }
    })
  })

  describe('serializeListState', () => {
    it('should serialize state to query string', () => {
      const state: ListState = {
        q: 'test',
        sort: 'title',
        page: 2,
        limit: 50,
        cols: ['title', 'status'],
        view: 'gallery',
        filters: [],
      }
      const qs = serializeListState(state)
      expect(qs).toContain('q=test')
      expect(qs).toContain('sort=title')
      expect(qs).toContain('page=2')
      expect(qs).toContain('limit=50')
      expect(qs).toContain('cols=title%2Cstatus')
      expect(qs).toContain('view=gallery')
    })

    it('should reset page to 1 when search changes', () => {
      const state: ListState = {
        q: 'old',
        sort: 'title',
        page: 5,
        limit: 25,
        cols: null,
        view: null,
        filters: [],
      }
      const qs = serializeListState(state, { q: 'new' })
      expect(qs).toContain('q=new')
      expect(qs).not.toContain('page=5')
      expect(qs).not.toContain('page=')
    })

    it('should reset page to 1 when limit changes', () => {
      const state: ListState = {
        q: '',
        sort: 'title',
        page: 5,
        limit: 25,
        cols: null,
        view: null,
        filters: [],
      }
      const qs = serializeListState(state, { limit: 50 })
      expect(qs).toContain('limit=50')
      expect(qs).not.toContain('page=5')
    })

    it('should omit default values', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        cols: null,
        view: null,
        filters: [],
      }
      const qs = serializeListState(state)
      expect(qs).toBe('')
    })
  })

  describe('getListDefaults', () => {
    it('should return defaults for known collections', () => {
      const defaults = getListDefaults('pages')
      expect(defaults.columns).toContain('title')
      expect(defaults.sort).toBe('-updatedAt')
      expect(defaults.limit).toBe(25)
    })

    it('should use useAsTitle for unknown collections', () => {
      const defaults = getListDefaults('custom', 'name')
      expect(defaults.columns).toContain('name')
      expect(defaults.searchFields).toContain('name')
    })

    it('should use adminDefaultColumns when provided', () => {
      const defaults = getListDefaults('custom', 'name', ['title', 'status'])
      expect(defaults.columns).toEqual(['title', 'status'])
    })
  })

  describe('resolveVisibleColumns', () => {
    it('should return columns in order by name', () => {
      const available = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
        { name: 'createdAt', label: 'Created', type: 'date', sortable: true, filterable: true },
      ]
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, ['createdAt', 'title'])
      expect(visibleNames).toEqual(['createdAt', 'title'])
      expect(visibleColumns).toHaveLength(2)
      expect(visibleColumns[0].name).toBe('createdAt')
      expect(visibleColumns[1].name).toBe('title')
    })

    it('should fall back to defaults when cols is null', () => {
      const available = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
      ]
      const { visibleNames } = resolveVisibleColumns(available, null, null, ['status'])
      expect(visibleNames).toEqual(['status'])
    })

    it('should fall back to first available if no columns match', () => {
      const available = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
      ]
      const { visibleNames } = resolveVisibleColumns(available, ['nonexistent'])
      expect(visibleNames).toEqual(['title'])
    })
  })

  describe('buildFindArgs', () => {
    it('should build find args with search and filter', () => {
      const state: ListState = {
        q: 'test',
        sort: 'title',
        page: 2,
        limit: 25,
        cols: null,
        view: null,
        filters: [
          { field: 'status', op: 'equals', value: 'published' },
        ],
      }
      const cols = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true, options: [{ label: 'Published', value: 'published' }] },
      ]
      const args = buildFindArgs({
        collection: 'pages',
        urlParams: state,
        allColumns: cols,
      })
      expect(args.page).toBe(2)
      expect(args.limit).toBe(25)
      expect(args.sort).toBe('title')
      expect(args.where).toBeDefined()
    })

    it('should validate sort field is sortable', () => {
      const state: ListState = {
        q: '',
        sort: 'unsortable',
        page: 1,
        limit: 25,
        cols: null,
        view: null,
        filters: [],
      }
      const cols = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'unsortable', label: 'Unsortable', type: 'text', sortable: false, filterable: true },
      ]
      const args = buildFindArgs({
        collection: 'pages',
        urlParams: state,
        allColumns: cols,
      })
      // Should fall back to default sort
      expect(args.sort).toBe('-updatedAt')
    })
  })

  describe('formatCellValue', () => {
    it('should format checkbox as Yes/No', () => {
      const field = { type: 'checkbox' } as unknown as Field
      expect(formatCellValue(true, {}, field, undefined)).toBe('Yes')
      expect(formatCellValue(false, {}, field, undefined)).toBe('No')
    })

    it('should format date as locale string', () => {
      const field = { type: 'date' } as unknown as Field
      const result = formatCellValue('2026-10-02', {}, field, undefined)
      expect(result).toMatch(/Oct|October/)
      expect(result).toContain('2026')
    })

    it('should format select with option label', () => {
      const field = {
        type: 'select',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
        ],
      } as unknown as Field
      const result = formatCellValue('published', {}, field, undefined)
      expect(result).toBe('Published')
    })

    it('should extract display value from relationship object', () => {
      const field = { type: 'relationship' } as unknown as Field
      const obj = { id: 1, title: 'Test Page', name: 'ignored' }
      const result = formatCellValue(obj, {}, field, undefined)
      expect(result).toBe('Test Page')
    })

    it('should join array relationship with commas', () => {
      const field = { type: 'relationship' } as unknown as Field
      const arr = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ]
      const result = formatCellValue(arr, {}, field, undefined)
      expect(result).toBe('Item 1, Item 2')
    })

    it('should return empty string for null/undefined', () => {
      expect(formatCellValue(null, {}, undefined, undefined)).toBe('')
      expect(formatCellValue(undefined, {}, undefined, undefined)).toBe('')
    })

    it('should return string primitives as-is', () => {
      expect(formatCellValue('text', {}, undefined, undefined)).toBe('text')
      expect(formatCellValue(42, {}, undefined, undefined)).toBe('42')
    })
  })
})
