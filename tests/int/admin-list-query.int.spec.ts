import { describe, expect, it } from 'vitest'

import {
  buildFindArgs,
  deriveColumns,
  getListDefaults,
  LIST_DEFAULTS,
  parseListSearchParams,
  resolveVisibleColumns,
  serializeListState,
  type ColumnDef,
  type CollectionListDefaults,
  type ListFilter,
  type ListState,
} from '@/admin/list/listQuery'
import type { Field } from '@/engine'
import { Events } from '@/collections/Events'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Memberships } from '@/features/members/collections/Memberships'
import { MembershipTiers } from '@/features/members/collections/MembershipTiers'
import { Products } from '@/features/ecommerce/collections/Products'

describe('admin/list/listQuery', () => {
  describe('parseListSearchParams', () => {
    it('parses basic params', () => {
      const sp = {
        q: 'test',
        sort: '-updatedAt',
        page: '2',
        limit: '50',
      }
      const state = parseListSearchParams(sp)
      expect(state.q).toBe('test')
      expect(state.sort).toBe('-updatedAt')
      expect(state.page).toBe(2)
      expect(state.limit).toBe(50)
    })

    it('defaults page to 1 if missing or invalid', () => {
      expect(parseListSearchParams({}).page).toBe(1)
      expect(parseListSearchParams({ page: 'abc' }).page).toBe(1)
      expect(parseListSearchParams({ page: '0' }).page).toBe(1)
      expect(parseListSearchParams({ page: '-1' }).page).toBe(1)
    })

    it('whitelists limit to [10, 25, 50, 100]', () => {
      expect(parseListSearchParams({ limit: '10' }).limit).toBe(10)
      expect(parseListSearchParams({ limit: '25' }).limit).toBe(25)
      expect(parseListSearchParams({ limit: '50' }).limit).toBe(50)
      expect(parseListSearchParams({ limit: '100' }).limit).toBe(100)
      expect(parseListSearchParams({ limit: '75' }).limit).toBe(25) // invalid -> default
      expect(parseListSearchParams({ limit: '999' }).limit).toBe(25)
      expect(parseListSearchParams({}).limit).toBe(25)
    })

    it('parses repeated f params as filters (field:op:value)', () => {
      const sp = {
        f: ['title:contains:hello', 'status:equals:draft'],
      }
      const state = parseListSearchParams(sp)
      expect(state.filters).toEqual([
        { field: 'title', op: 'contains', value: 'hello' },
        { field: 'status', op: 'equals', value: 'draft' },
      ])
    })

    it('handles colon-containing filter values (split on first two colons only)', () => {
      const sp = {
        f: 'url:contains:https://example.com',
      }
      const state = parseListSearchParams(sp)
      expect(state.filters).toEqual([
        { field: 'url', op: 'contains', value: 'https://example.com' },
      ])
    })

    it('ignores invalid filter ops', () => {
      const sp = {
        f: [
          'title:invalid:hello',
          'status:equals:draft',
          'author:badop:john',
        ],
      }
      const state = parseListSearchParams(sp)
      expect(state.filters).toEqual([
        { field: 'status', op: 'equals', value: 'draft' },
      ])
    })

    it('parses cols as comma-separated list', () => {
      const sp = { cols: 'title,slug,status' }
      const state = parseListSearchParams(sp)
      expect(state.cols).toEqual(['title', 'slug', 'status'])
    })

    it('treats missing cols as null', () => {
      const sp = {}
      const state = parseListSearchParams(sp)
      expect(state.cols).toBeNull()
    })

    it('parses view param', () => {
      const sp = { view: 'calendar' }
      const state = parseListSearchParams(sp)
      expect(state.view).toBe('calendar')
    })
  })

  describe('serializeListState', () => {
    it('serializes full state', () => {
      const state: ListState = {
        q: 'test',
        sort: '-createdAt',
        page: 2,
        limit: 50,
        filters: [
          { field: 'status', op: 'equals', value: 'draft' },
          { field: 'author', op: 'contains', value: 'john' },
        ],
        cols: ['title', 'status', 'createdAt'],
        view: null,
      }
      const qs = serializeListState(state)
      expect(qs).toContain('q=test')
      expect(qs).toContain('sort=-createdAt')
      expect(qs).toContain('page=2')
      expect(qs).toContain('limit=50')
      expect(qs).toContain('f=status%3Aequals%3Adraft')
      expect(qs).toContain('f=author%3Acontains%3Ajohn')
      expect(qs).toContain('cols=title%2Cstatus%2CcreatedAt')
    })

    it('omits defaults (page 1, limit 25, empty q/sort/filters, null cols/view)', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state)
      expect(qs).toBe('')
    })

    it('resets page to 1 when q changes (unless page in overrides)', () => {
      const state: ListState = {
        q: 'old',
        sort: '',
        page: 3,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state, { q: 'new' })
      expect(qs).not.toContain('page=')
      expect(qs).toContain('q=new')
    })

    it('resets page to 1 when sort changes', () => {
      const state: ListState = {
        q: '',
        sort: '-createdAt',
        page: 3,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state, { sort: '-updatedAt' })
      expect(qs).not.toContain('page=')
    })

    it('resets page to 1 when filters change', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 3,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state, { filters: [{ field: 'status', op: 'equals', value: 'draft' }] })
      expect(qs).not.toContain('page=')
    })

    it('resets page to 1 when limit changes', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 3,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state, { limit: 50 })
      expect(qs).not.toContain('page=')
    })

    it('preserves page when explicitly in overrides', () => {
      const state: ListState = {
        q: 'old',
        sort: '',
        page: 3,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const qs = serializeListState(state, { q: 'new', page: 3 })
      expect(qs).toContain('page=3')
    })

    it('round-trips through parse', () => {
      const orig: ListState = {
        q: 'search term',
        sort: '-updatedAt',
        page: 2,
        limit: 50,
        filters: [
          { field: 'title', op: 'contains', value: 'hello' },
          { field: 'status', op: 'equals', value: 'published' },
        ],
        cols: ['title', 'slug', 'status'],
        view: 'list',
      }
      const qs = serializeListState(orig)
      const params: Record<string, string | string[] | undefined> = {}
      new URLSearchParams(qs).forEach((value, key) => {
        if (params[key]) {
          if (Array.isArray(params[key])) {
            ;(params[key] as string[]).push(value)
          } else {
            params[key] = [params[key] as string, value]
          }
        } else {
          params[key] = value
        }
      })
      const parsed = parseListSearchParams(params)
      expect(parsed.q).toBe(orig.q)
      expect(parsed.sort).toBe(orig.sort)
      expect(parsed.page).toBe(orig.page)
      expect(parsed.limit).toBe(orig.limit)
      expect(parsed.cols).toEqual(orig.cols)
      expect(parsed.view).toEqual(orig.view)
      // Filters may be reordered, so check as sets
      expect(new Set(parsed.filters.map((f) => JSON.stringify(f)))).toEqual(
        new Set(orig.filters.map((f) => JSON.stringify(f))),
      )
    })
  })

  describe('deriveColumns', () => {
    it('derives columns from Pages (includes title, parent, slug, _status)', () => {
      const cols = deriveColumns(Pages.fields, { drafts: true })
      const names = cols.map((c) => c.name)
      expect(names).toContain('title')
      expect(names).toContain('parent')
      expect(names).toContain('slug')
      expect(names).toContain('_status')
      expect(names).toContain('updatedAt')
    })

    it('derives columns from Posts', () => {
      const cols = deriveColumns(Posts.fields, { drafts: true })
      const names = cols.map((c) => c.name)
      expect(names).toContain('title')
      expect(names).toContain('slug')
      expect(names).toContain('publishedDate')
      expect(names).toContain('_status')
    })

    it('derives columns from Users (has roles)', () => {
      const cols = deriveColumns(Users.fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('roles') // select, hasMany - skip
      expect(names).toContain('updatedAt')
    })

    it('skips hidden fields', () => {
      const fields: Field[] = [
        { name: 'visible', type: 'text' },
        { name: 'hidden', type: 'text', hidden: true },
        { name: 'adminHidden', type: 'text', admin: { hidden: true } },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('visible')
      expect(names).not.toContain('hidden')
      expect(names).not.toContain('adminHidden')
    })

    it('skips group, array, blocks, richText, json types', () => {
      const fields: Field[] = [
        { name: 'title', type: 'text' },
        { type: 'group', fields: [{ name: 'grouped', type: 'text' }] },
        { type: 'array', fields: [{ name: 'arrayed', type: 'text' }] },
        { type: 'blocks', blocks: [] },
        { type: 'richText' },
        { type: 'json' },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('title')
      expect(names).not.toContain('grouped')
      expect(names).not.toContain('arrayed')
    })

    it('descends into row without a name', () => {
      const fields: Field[] = [
        {
          type: 'row',
          fields: [
            { name: 'firstName', type: 'text' },
            { name: 'lastName', type: 'text' },
          ],
        },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('firstName')
      expect(names).toContain('lastName')
    })

    it('descends into collapsible without a name', () => {
      const fields: Field[] = [
        {
          type: 'collapsible',
          fields: [
            { name: 'detail1', type: 'text' },
            { name: 'detail2', type: 'text' },
          ],
        },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('detail1')
      expect(names).toContain('detail2')
    })

    it('descends into tabs without a name', () => {
      const fields: Field[] = [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Tab 1',
              fields: [{ name: 'tab1Field', type: 'text' }],
            },
            {
              label: 'Tab 2',
              fields: [{ name: 'tab2Field', type: 'text' }],
            },
          ],
        },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('tab1Field')
      expect(names).toContain('tab2Field')
    })

    it('marks text/textarea/email as sortable and filterable', () => {
      const fields: Field[] = [{ name: 'title', type: 'text' }]
      const cols = deriveColumns(fields, { drafts: false })
      const col = cols.find((c) => c.name === 'title')
      expect(col?.sortable).toBe(true)
      expect(col?.filterable).toBe(true)
    })

    it('marks select with options', () => {
      const fields: Field[] = [
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Published', value: 'published' },
          ],
        },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const col = cols.find((c) => c.name === 'status')
      expect(col?.options).toEqual([
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ])
    })

    it('marks relationships/uploads with hasMany false as unsortable/unfilterable', () => {
      const fields: Field[] = [
        { name: 'author', type: 'relationship', relationTo: 'users', hasMany: false },
        { name: 'image', type: 'upload', relationTo: 'media', hasMany: false },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const author = cols.find((c) => c.name === 'author')
      const image = cols.find((c) => c.name === 'image')
      expect(author?.sortable).toBe(false)
      expect(author?.filterable).toBe(false)
      expect(image?.sortable).toBe(false)
      expect(image?.filterable).toBe(false)
    })

    it('skips relationships with hasMany true', () => {
      const fields: Field[] = [
        { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
      ]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).not.toContain('tags')
    })

    it('includes synthetic id, createdAt, updatedAt columns', () => {
      const fields: Field[] = [{ name: 'title', type: 'text' }]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).toContain('id')
      expect(names).toContain('createdAt')
      expect(names).toContain('updatedAt')
    })

    it('includes _status when drafts: true', () => {
      const fields: Field[] = [{ name: 'title', type: 'text' }]
      const cols = deriveColumns(fields, { drafts: true })
      const names = cols.map((c) => c.name)
      expect(names).toContain('_status')
    })

    it('skips _status when drafts: false', () => {
      const fields: Field[] = [{ name: 'title', type: 'text' }]
      const cols = deriveColumns(fields, { drafts: false })
      const names = cols.map((c) => c.name)
      expect(names).not.toContain('_status')
    })
  })

  describe('LIST_DEFAULTS', () => {
    it('has entries for users, memberships, membership-tiers, media, pages, posts, events, products', () => {
      expect(LIST_DEFAULTS.users).toBeDefined()
      expect(LIST_DEFAULTS.memberships).toBeDefined()
      expect(LIST_DEFAULTS['membership-tiers']).toBeDefined()
      expect(LIST_DEFAULTS.media).toBeDefined()
      expect(LIST_DEFAULTS.pages).toBeDefined()
      expect(LIST_DEFAULTS.posts).toBeDefined()
      expect(LIST_DEFAULTS.events).toBeDefined()
      expect(LIST_DEFAULTS.products).toBeDefined()
    })

    it('all default columns exist via deriveColumns for users', () => {
      const cols = deriveColumns(Users.fields, { drafts: false, collectionSlug: 'users' })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.users.columns
      for (const colName of defaults) {
        expect(colNames.has(colName)).toBe(true)
      }
    })

    it('all default columns exist via deriveColumns for memberships', () => {
      const cols = deriveColumns(Memberships.fields, { drafts: false })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.memberships.columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for membership-tiers', () => {
      const cols = deriveColumns(MembershipTiers.fields, { drafts: false })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS['membership-tiers'].columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for media', () => {
      const cols = deriveColumns(Media.fields, { drafts: false, collectionSlug: 'media' })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.media.columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for pages', () => {
      const cols = deriveColumns(Pages.fields, { drafts: true })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.pages.columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for posts', () => {
      const cols = deriveColumns(Posts.fields, { drafts: true })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.posts.columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for events', () => {
      const cols = deriveColumns(Events.fields, { drafts: true })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.events.columns
      for (const colName of defaults) {
        expect(colNames).toContain(colName)
      }
    })

    it('all default columns exist via deriveColumns for products', () => {
      const cols = deriveColumns(Products.fields, { drafts: true })
      const colNames = new Set(cols.map((c) => c.name))
      const defaults = LIST_DEFAULTS.products.columns
      for (const colName of defaults) {
        expect(colNames.has(colName)).toBe(true)
      }
    })
  })

  describe('buildFindArgs', () => {
    it('builds where clause for search over searchFields', () => {
      const state: ListState = {
        q: 'test',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
      ]
      const args = buildFindArgs({ collection: 'pages', urlParams: state, allColumns: cols })
      expect(args.where).toEqual({
        or: [
          { title: { contains: 'test' } },
          { slug: { contains: 'test' } },
        ],
      })
    })

    it('ignores search fields that do not exist in available columns', () => {
      const state: ListState = {
        q: 'test',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
      ]
      const args = buildFindArgs({ collection: 'pages', urlParams: state, allColumns: cols })
      expect(args.where).toEqual({
        or: [{ title: { contains: 'test' } }],
      })
    })

    it('converts filters to conditions', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [
          { field: 'status', op: 'equals', value: 'draft' },
          { field: 'published', op: 'equals', value: 'true' },
        ],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
        { name: 'published', label: 'Published', type: 'checkbox', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.where).toEqual({
        and: [
          { status: { equals: 'draft' } },
          { published: { equals: true } },
        ],
      })
    })

    it('ignores filters on non-filterable columns', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [{ field: 'author', op: 'equals', value: 'john' }],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'author', label: 'Author', type: 'relationship', sortable: false, filterable: false },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.where).toBeUndefined()
    })

    it('coerces number filter values', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [{ field: 'count', op: 'greater_than', value: '5' }],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'count', label: 'Count', type: 'number', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.where).toEqual({
        count: { greater_than: 5 },
      })
    })

    it('coerces checkbox filter values', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [{ field: 'active', op: 'equals', value: 'true' }],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'active', label: 'Active', type: 'checkbox', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.where).toEqual({
        active: { equals: true },
      })
    })

    it('uses state.sort if provided and sortable', () => {
      const state: ListState = {
        q: '',
        sort: '-createdAt',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'createdAt', label: 'Created', type: 'date', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '-updatedAt', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.sort).toBe('-createdAt')
    })

    it('falls back to default sort if state.sort not sortable', () => {
      const state: ListState = {
        q: '',
        sort: 'author',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'author', label: 'Author', type: 'relationship', sortable: false, filterable: false },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '-updatedAt', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.sort).toBe('-updatedAt')
    })

    it('falls back to default sort if state.sort references nonexistent field', () => {
      const state: ListState = {
        q: '',
        sort: '-nonexistent',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = []
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '-updatedAt', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.sort).toBe('-updatedAt')
    })

    it('preserves leading - in sort for descending', () => {
      const state: ListState = {
        q: '',
        sort: '-title',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: 'title', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.sort).toBe('-title')
    })

    it('includes page and limit in result', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 3,
        limit: 50,
        filters: [],
        cols: null,
        view: null,
      }
      const cols: ColumnDef[] = []
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const args = buildFindArgs({ collection: "pages", urlParams: state, allColumns: cols })
      expect(args.page).toBe(3)
      expect(args.limit).toBe(50)
    })
  })

  describe('resolveVisibleColumns', () => {
    it('prioritizes URL cols', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: ['title', 'slug'],
        view: null,
      }
      const available: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: ['status'], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, state.cols, undefined, defaults.columns)
      expect(visibleNames).toEqual(['title', 'slug'])
    })

    it('falls back to savedCols if URL cols absent', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const available: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: ['status'], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, null, ["title", "slug"], defaults.columns)
      expect(visibleNames).toEqual(['title', 'slug'])
    })

    it('falls back to defaults if URL cols and savedCols absent', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const available: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
        { name: 'status', label: 'Status', type: 'select', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: ['status'], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, state.cols, undefined, defaults.columns)
      expect(visibleNames).toEqual(['status'])
    })

    it('drops unknown column names', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: ['title', 'nonexistent', 'slug'],
        view: null,
      }
      const available: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, state.cols, undefined, defaults.columns)
      expect(visibleNames).toEqual(['title', 'slug'])
    })

    it('falls back to first available if result would be empty', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: ['nonexistent1', 'nonexistent2'],
        view: null,
      }
      const available: ColumnDef[] = [
        { name: 'title', label: 'Title', type: 'text', sortable: true, filterable: true },
        { name: 'slug', label: 'Slug', type: 'text', sortable: true, filterable: true },
      ]
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, state.cols, undefined, defaults.columns)
      expect(visibleColumns.length).toBe(1)
      expect(visibleColumns[0].name).toBe('title')
    })

    it('never returns empty', () => {
      const state: ListState = {
        q: '',
        sort: '',
        page: 1,
        limit: 25,
        filters: [],
        cols: null,
        view: null,
      }
      const available: ColumnDef[] = []
      const defaults: CollectionListDefaults = { columns: [], searchFields: [], sort: '', limit: 25 }
      const { visibleColumns, visibleNames } = resolveVisibleColumns(available, state.cols, undefined, defaults.columns)
      expect(visibleColumns.length).toBe(0)
    })
  })
})

describe('buildFindArgs empty filter values', () => {
  it('skips filters with empty value', () => {
    const allColumns = deriveColumns(Users.fields, { drafts: false, collectionSlug: 'users' })
    const args = buildFindArgs({
      collection: 'users',
      urlParams: { q: '', sort: '', page: 1, limit: 25, filters: [{ field: 'email', op: 'equals', value: '' }], cols: null, view: null },
      allColumns,
    })
    expect(args.where).toBeUndefined()
  })
})
