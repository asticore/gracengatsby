// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { ValidationError } from '@/localapi/operations'
import type { CustomFieldDef, FieldGroupDoc } from '@/fields/customFields/types'

import { normalizeFieldGroup, normalizeDefinition, legacyFieldsToDefinition, effectiveDefinition, effectiveLocation, defaultValueFor, findDuplicateNames, MAX_FIELD_DEPTH } from '@/features/customFields/normalize'
import { matchesLocation, couldApplyToCollection } from '@/features/customFields/location'
import { evaluateConditions, pruneHiddenValues } from '@/features/customFields/conditions'
import { validateFieldValues, definitionsFor, applyDefaults, isAllowedOembedUrl } from '@/features/customFields/validate'
import { buildCustomFieldContext, buildGuessedCustomContext, collectMediaIds, stringifyFieldValue } from '@/features/customFields/stringify'
import { oembedEmbedUrl } from '@/features/customFields/oembed'
import { buildMergeContext, resolveDocumentBlocks, resolveTags, safeUrl } from '@/lib/mergeTags'
import { normalizeLocation } from '@/features/customFields/normalize'
import { definedValueKeys } from '@/features/customFields/validate'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroBlock } from '@/components/blocks/HeroBlock'
import { CtaBannerBlock } from '@/components/blocks/CtaBannerBlock'
import { HeadingElement } from '@/components/blocks/elements/HeadingElement'
import { LoopBlock } from '@/components/blocks/LoopBlock'
import { generateMetadata as blogPostMetadata } from '@/app/(frontend)/blog/[slug]/page'

const holder = vi.hoisted(() => ({ db: null as unknown }))
const serverMock = vi.hoisted(() => ({
  loadFieldGroups: vi.fn(),
  locationContextFor: vi.fn(),
  fetchMediaUrls: vi.fn(),
}))
const adminMock = vi.hoisted(() => ({ getAdminContext: vi.fn() }))
const engineMock = vi.hoisted(() => ({ getEngine: vi.fn() }))

vi.mock('@/cms/db/connect', () => ({ getDb: vi.fn(async () => holder.db) }))
vi.mock('@/features/customFields/server', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, loadFieldGroups: serverMock.loadFieldGroups, fetchMediaUrls: serverMock.fetchMediaUrls }
})
vi.mock('@/admin/auth', () => ({ getAdminContext: adminMock.getAdminContext }))
vi.mock('@/lib/engine', () => ({ getEngine: engineMock.getEngine }))
vi.mock('next/headers', () => ({ cookies: async (): Promise<unknown> => ({ get: (): undefined => undefined }) }))
vi.mock('@/features/visibility/gate', () => ({ getPasswordGateState: async (): Promise<string> => 'open' }))
vi.mock('@/utilities/seo', () => ({ buildMetadata: (args: unknown) => args }))
vi.mock('@/features/seo', () => ({ PageJsonLd: (): null => null }))
vi.mock('@/components/PasswordGate', () => ({ PasswordGate: (): null => null }))
vi.mock('@/components/blocks/BlockRenderer', () => ({ BlockRenderer: (): null => null }))
vi.mock('@/engine/editor/react', () => ({ RichText: (): null => null }))

import { prepareCustomFieldsForSave } from '@/features/customFields/serverHook'
import { saveOptionValues, getOption, isValidOptionSlug } from '@/features/customFields/options'
import { GET as getFieldGroupsRoute } from '@/app/(engage)/api/admin-field-groups/route'
import { POST as postOptionsRoute } from '@/app/(engage)/api/admin-field-options/[slug]/route'

const field = (over: Partial<CustomFieldDef> & { name: string; type: CustomFieldDef['type'] }): CustomFieldDef => ({
  label: over.name,
  required: false,
  ...over,
})

const group = (over: Partial<FieldGroupDoc> & { id: number; fields: CustomFieldDef[] }): FieldGroupDoc => ({
  name: `group ${over.id}`,
  location: [[{ param: 'collection', operator: 'equals', value: 'pages' }]],
  ...over,
})

describe('normalise: legacy rows and definitions', () => {
  it('converts legacy nested rows into a definition', () => {
    const defs = legacyFieldsToDefinition([{ label: 'Price', name: 'price', type: 'number', required: true, options: null }])
    expect(defs).toEqual([expect.objectContaining({ name: 'price', label: 'Price', type: 'number', required: true })])
  })

  it('prefers a non-empty builder definition and falls back to legacy rows', () => {
    const legacy = [{ label: 'Old', name: 'old', type: 'text' }]
    expect(effectiveDefinition({ definition: [{ label: 'New', name: 'new', type: 'text' }], fields: legacy }).map((d) => d.name)).toEqual(['new'])
    expect(effectiveDefinition({ definition: null, fields: legacy }).map((d) => d.name)).toEqual(['old'])
  })

  it('coerces unknown types to text, drops nameless fields and keeps the first duplicate', () => {
    const defs = normalizeDefinition([
      { name: 'a', type: 'hologram' },
      { label: 'no name', type: 'text' },
      { name: 'a', type: 'number' },
    ])
    expect(defs).toHaveLength(1)
    expect(defs[0]).toMatchObject({ name: 'a', type: 'text' })
    expect(findDuplicateNames([{ name: 'x', label: 'x', type: 'text' }, { name: 'x', label: 'x', type: 'text' }])).toEqual(['x'])
  })

  it('caps nesting depth and drops sub-fields beyond it', () => {
    let deepest: Record<string, unknown> = { name: 'leaf', type: 'text' }
    for (let i = 0; i < MAX_FIELD_DEPTH + 1; i++) deepest = { name: `level${i}`, type: 'group', subFields: [deepest] }
    const top = normalizeDefinition([deepest])
    let node: CustomFieldDef | undefined = top[0]
    let depth = 1
    while (node?.subFields && node.subFields.length) {
      node = node.subFields[0]
      depth++
    }
    expect(depth).toBeLessThanOrEqual(MAX_FIELD_DEPTH)
  })

  it('uses explicit location, otherwise the legacy quick rule', () => {
    expect(effectiveLocation({ targetCollections: ['pages', 'posts'] })).toEqual([
      [{ param: 'collection', operator: 'equals', value: 'pages' }],
      [{ param: 'collection', operator: 'equals', value: 'posts' }],
    ])
    expect(effectiveLocation({ targetCollections: ['pages'], location: [[{ param: 'pageTemplate', operator: 'equals', value: '4' }]] })).toEqual([
      [{ param: 'pageTemplate', operator: 'equals', value: '4' }],
    ])
    const doc = normalizeFieldGroup({ id: 9, name: 'Legacy', targetCollections: ['faqs'], fields: [{ label: 'Q', name: 'q', type: 'text' }] })
    expect(doc).toMatchObject({ id: 9, name: 'Legacy', fields: [expect.objectContaining({ name: 'q' })] })
    expect(couldApplyToCollection(doc.location, 'faqs')).toBe(true)
  })

  it('reads JSON text columns', () => {
    const defs = normalizeDefinition(JSON.stringify([{ name: 'n', type: 'number', min: 1 }]))
    expect(defs[0]).toMatchObject({ name: 'n', type: 'number', min: 1 })
  })
})

describe('location matching', () => {
  const pagesOnly = [[{ param: 'collection' as const, operator: 'equals' as const, value: 'pages' }]]

  it('matches a collection and rejects others', () => {
    expect(matchesLocation(pagesOnly, { collection: 'pages' })).toBe(true)
    expect(matchesLocation(pagesOnly, { collection: 'posts' })).toBe(false)
    expect(matchesLocation([], { collection: 'pages' })).toBe(false)
  })

  it('ORs groups and ANDs rules within a group', () => {
    const rules = [
      [
        { param: 'collection' as const, operator: 'equals' as const, value: 'pages' },
        { param: 'pageTemplate' as const, operator: 'equals' as const, value: '7' },
      ],
      [{ param: 'collection' as const, operator: 'equals' as const, value: 'events' }],
    ]
    expect(matchesLocation(rules, { collection: 'pages', pageTemplate: 7 })).toBe(true)
    expect(matchesLocation(rules, { collection: 'pages', pageTemplate: 8 })).toBe(false)
    expect(matchesLocation(rules, { collection: 'events' })).toBe(true)
  })

  it('handles parent "none", notEquals, and roles', () => {
    const topLevel = [[{ param: 'pageParent' as const, operator: 'equals' as const, value: 'none' }]]
    expect(matchesLocation(topLevel, { collection: 'pages', pageParent: null })).toBe(true)
    expect(matchesLocation(topLevel, { collection: 'pages', pageParent: 3 })).toBe(false)
    const notAdmin = [[{ param: 'userRole' as const, operator: 'notEquals' as const, value: 'admin' }]]
    expect(matchesLocation(notAdmin, { collection: 'pages', userRoles: ['editor'] })).toBe(true)
    expect(matchesLocation(notAdmin, { collection: 'pages', userRoles: ['admin'] })).toBe(false)
  })

  it('does not apply a rule the context does not have', () => {
    const templateRule = [[{ param: 'pageTemplate' as const, operator: 'notEquals' as const, value: '1' }]]
    expect(matchesLocation(templateRule, { collection: 'posts' })).toBe(false)
  })

  it('matches options pages by slug only', () => {
    const opts = [[{ param: 'optionsPage' as const, operator: 'equals' as const, value: 'contact' }]]
    expect(matchesLocation(opts, { optionsPage: 'contact' })).toBe(true)
    expect(couldApplyToCollection(opts, 'pages')).toBe(false)
  })
})

describe('conditional logic', () => {
  const values = { kind: 'video', count: 5, tags: ['a', 'b'], empty: '' }

  it('evaluates each operator', () => {
    const rule = (field: string, operator: 'equals' | 'notEquals' | 'isEmpty' | 'notEmpty' | 'contains' | 'greater' | 'less', value?: string) => ({ field, operator, value })
    expect(evaluateConditions([[rule('kind', 'equals', 'video')]], values)).toBe(true)
    expect(evaluateConditions([[rule('kind', 'notEquals', 'video')]], values)).toBe(false)
    expect(evaluateConditions([[rule('empty', 'isEmpty')]], values)).toBe(true)
    expect(evaluateConditions([[rule('kind', 'notEmpty')]], values)).toBe(true)
    expect(evaluateConditions([[rule('kind', 'contains', 'ide')]], values)).toBe(true)
    expect(evaluateConditions([[rule('tags', 'contains', 'b')]], values)).toBe(true)
    expect(evaluateConditions([[rule('count', 'greater', '4')]], values)).toBe(true)
    expect(evaluateConditions([[rule('count', 'less', '4')]], values)).toBe(false)
    expect(evaluateConditions([[rule('missing', 'greater', '1')]], values)).toBe(false)
  })

  it('ORs groups and ANDs rules, and no conditions means always shown', () => {
    expect(evaluateConditions(null, values)).toBe(true)
    expect(
      evaluateConditions(
        [
          [
            { field: 'kind', operator: 'equals', value: 'audio' },
            { field: 'count', operator: 'greater', value: '1' },
          ],
          [{ field: 'kind', operator: 'equals', value: 'video' }],
        ],
        values,
      ),
    ).toBe(true)
  })

  it('removes hidden values, including inside repeater rows', () => {
    const defs = [
      field({ name: 'kind', type: 'text' }),
      field({ name: 'link', type: 'text', conditions: [[{ field: 'kind', operator: 'equals', value: 'audio' }]] }),
      field({
        name: 'rows',
        type: 'repeater',
        subFields: [
          field({ name: 'mode', type: 'text' }),
          field({ name: 'extra', type: 'text', conditions: [[{ field: 'mode', operator: 'equals', value: 'x' }]] }),
        ],
      }),
    ]
    const pruned = pruneHiddenValues(defs, { kind: 'video', link: 'http://x', rows: [{ mode: 'x', extra: 'kept' }, { mode: 'y', extra: 'dropped' }] })
    expect(pruned).toEqual({ kind: 'video', rows: [{ mode: 'x', extra: 'kept' }, { mode: 'y' }] })
  })
})

describe('validators', () => {
  const run = (defs: CustomFieldDef[], values: Record<string, unknown>) => validateFieldValues(defs, values)
  const messages = (defs: CustomFieldDef[], values: Record<string, unknown>) => run(defs, values).map((p) => `${p.path}: ${p.message}`)

  it('requires required fields, and checkboxes must be ticked', () => {
    expect(messages([field({ name: 'title', type: 'text', required: true })], {})).toEqual(['title: is required'])
    expect(messages([field({ name: 'agree', type: 'checkbox', required: true })], { agree: false })).toEqual(['agree: is required'])
    expect(messages([field({ name: 'agree', type: 'checkbox', required: true })], { agree: true })).toEqual([])
  })

  it('enforces number bounds and step', () => {
    const bounded = field({ name: 'n', type: 'number', min: 1, max: 10 })
    expect(messages([bounded], { n: 0 })).toEqual(['n: must be at least 1'])
    expect(messages([bounded], { n: 11 })).toEqual(['n: must be at most 10'])
    expect(messages([bounded], { n: 'x' })).toEqual(['n: must be a number'])
    expect(messages([bounded], { n: 5 })).toEqual([])

    // Steps are counted from the minimum (or zero when there is none).
    const stepped = field({ name: 'n', type: 'number', min: 1, step: 2 })
    expect(messages([stepped], { n: 3 })).toEqual([])
    expect(messages([stepped], { n: 4 })).toEqual(['n: must be a multiple of 2'])
    expect(messages([field({ name: 's', type: 'number', step: 2 })], { s: 3 })).toEqual(['s: must be a multiple of 2'])
  })

  it('enforces text length, pattern with message, and formats', () => {
    expect(messages([field({ name: 't', type: 'text', min: 3, max: 4 })], { t: 'ab' })).toEqual(['t: must be at least 3 characters'])
    expect(messages([field({ name: 'code', type: 'text', pattern: '^[A-Z]+$', patternMessage: 'Uppercase only' })], { code: 'abc' })).toEqual([
      'code: Uppercase only',
    ])
    expect(messages([field({ name: 'e', type: 'email' })], { e: 'nope' })).toEqual(['e: must be a valid email address'])
    expect(messages([field({ name: 'u', type: 'url' })], { u: 'javascript:alert(1)' })).toEqual([
      'u: must be a valid link: http, https, mailto or tel, or a path starting with /',
    ])
    expect(messages([field({ name: 'c', type: 'color' })], { c: 'red' })).toEqual(['c: must be a hex colour like #1a2b3c'])
    expect(messages([field({ name: 'd', type: 'date' })], { d: '2026-13-40' })).toEqual(['d: must be a valid date'])
    expect(messages([field({ name: 'tm', type: 'time' })], { tm: '25:00' })).toEqual(['tm: must be a time like 14:30'])
    expect(messages([field({ name: 'p', type: 'phone' })], { p: '12' })).toEqual(['p: must be a valid phone number'])
  })

  it('checks choices for select, multi-select and radio', () => {
    const opts = [
      { label: 'Red', value: 'red' },
      { label: 'Blue', value: 'blue' },
    ]
    expect(messages([field({ name: 's', type: 'select', options: opts })], { s: 'green' })).toEqual(['s: has a value that is not one of the choices'])
    expect(messages([field({ name: 'm', type: 'select', multiple: true, options: opts })], { m: ['red', 'blue'] })).toEqual([])
    expect(messages([field({ name: 'r', type: 'radio', options: opts })], { r: 'green' })).toEqual(['r: is not one of the choices'])
  })

  it('limits gallery and relationship counts', () => {
    expect(messages([field({ name: 'g', type: 'gallery', min: 2, max: 3 })], { g: [1] })).toEqual(['g: needs at least 2 items'])
    expect(messages([field({ name: 'g', type: 'gallery', max: 1 })], { g: [1, 2] })).toEqual(['g: allows at most 1 items'])
    expect(messages([field({ name: 'r', type: 'relationship', hasMany: true, max: 1 })], { r: [1, 2] })).toEqual(['r: allows at most 1 documents'])
  })

  it('validates link targets and map coordinates', () => {
    expect(messages([field({ name: 'l', type: 'link' })], { l: { url: 'https://example.com', target: '_blank' } })).toEqual([])
    expect(messages([field({ name: 'l', type: 'link' })], { l: { url: 'not a url' } })).toEqual([
      'l: needs a valid link: http, https, mailto or tel, or a path starting with /',
    ])
    expect(messages([field({ name: 'l', type: 'link' })], { l: { url: 'https://a.test', target: '_parent' } })).toEqual(['l: has an unknown target'])
    expect(messages([field({ name: 'm', type: 'map' })], { m: { lat: 91, lng: 0 } })).toEqual(['m: latitude must be between -90 and 90'])
    expect(messages([field({ name: 'm', type: 'map' })], { m: { lat: 1, lng: 181 } })).toEqual(['m: longitude must be between -180 and 180'])
  })

  it('only embeds allow-listed https providers', () => {
    expect(isAllowedOembedUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true)
    expect(isAllowedOembedUrl('http://www.youtube.com/watch?v=abcdefghijk')).toBe(false)
    expect(isAllowedOembedUrl('https://evil.example.com/embed')).toBe(false)
    expect(isAllowedOembedUrl('https://youtube.com.evil.example/x')).toBe(false)
    expect(messages([field({ name: 'v', type: 'oembed' })], { v: 'https://evil.example.com/x' })).toHaveLength(1)
  })

  it('validates nested repeater rows with a row path', () => {
    const defs = [
      field({
        name: 'speakers',
        type: 'repeater',
        min: 1,
        subFields: [field({ name: 'name', label: 'Name', type: 'text', required: true }), field({ name: 'role', label: 'Role', type: 'select', options: [{ label: 'Host', value: 'host' }] })],
      }),
    ]
    expect(run(defs, { speakers: [] })[0]).toMatchObject({ message: 'needs at least 1 rows' })
    const problems = run(defs, { speakers: [{ name: 'Ada', role: 'host' }, { role: 'guest' }] })
    expect(problems.map((p) => p.path)).toEqual(['speakers › Row 2 › Name', 'speakers › Row 2 › Role'])
    expect(problems.every((p) => p.field === 'speakers')).toBe(true)
  })

  it('validates group sub-fields and flexible layouts', () => {
    const defs = [
      field({ name: 'address', type: 'group', subFields: [field({ name: 'postcode', label: 'Postcode', type: 'text', required: true })] }),
      field({
        name: 'blocks',
        type: 'flexible',
        layouts: [{ name: 'quote', label: 'Quote', subFields: [field({ name: 'text', label: 'Quote text', type: 'textarea', required: true })] }],
      }),
    ]
    expect(messages(defs, { address: {}, blocks: [{ layout: 'quote' }, { layout: 'missing' }] })).toEqual([
      'address › Postcode: is required',
      'blocks › Row 1 › Quote text: is required',
      'blocks › Row 2: uses a layout that does not exist',
    ])
  })

  it('skips hidden fields so they are never required', () => {
    const defs = [
      field({ name: 'kind', type: 'select', options: [{ label: 'Video', value: 'video' }, { label: 'Audio', value: 'audio' }] }),
      field({ name: 'podcast_url', label: 'Podcast URL', type: 'url', required: true, conditions: [[{ field: 'kind', operator: 'equals', value: 'audio' }]] }),
    ]
    expect(messages(defs, { kind: 'video' })).toEqual([])
    expect(messages(defs, { kind: 'audio' })).toEqual(['Podcast URL: is required'])
  })

  it('applies defaults only where a value is missing', () => {
    const defs = [
      field({ name: 'n', type: 'number', defaultValue: '3' }),
      field({ name: 'c', type: 'checkbox', defaultValue: 'true' }),
      field({ name: 'keep', type: 'text', defaultValue: 'x' }),
    ]
    expect(applyDefaults(defs, { keep: 'set' })).toEqual({ n: 3, c: true, keep: 'set' })
    expect(defaultValueFor(field({ name: 'g', type: 'gallery', defaultValue: '1' }))).toBeUndefined()
  })

  it('picks groups by location and keeps the first definition of a duplicated name', () => {
    const groups = [
      group({ id: 1, fields: [field({ name: 'price', type: 'number', label: 'Old' })] }),
      group({ id: 2, fields: [field({ name: 'price', type: 'text', label: 'New' }), field({ name: 'sku', type: 'text' })] }),
      group({ id: 3, location: [[{ param: 'collection', operator: 'equals', value: 'posts' }]], fields: [field({ name: 'post_only', type: 'text' })] }),
    ]
    const defs = definitionsFor(groups, { collection: 'pages' })
    expect(defs.map((d) => `${d.name}:${d.type}`)).toEqual(['price:number', 'sku:text'])
  })
})

describe('merge tag output', () => {
  const defs = [
    field({ name: 'featured', label: 'Featured', type: 'checkbox' }),
    field({ name: 'kind', label: 'Kind', type: 'select', options: [{ label: 'Video', value: 'video' }] }),
    field({ name: 'day', label: 'Day', type: 'date' }),
    field({ name: 'cta', label: 'CTA', type: 'link' }),
    field({ name: 'hero', label: 'Hero', type: 'image' }),
    field({ name: 'shots', label: 'Shots', type: 'gallery' }),
    field({ name: 'tags', label: 'Tags', type: 'select', multiple: true, options: [{ label: 'New', value: 'new' }, { label: 'Sale', value: 'sale' }] }),
    field({
      name: 'rows',
      label: 'Rows',
      type: 'repeater',
      subFields: [field({ name: 'title', label: 'Title', type: 'text' })],
    }),
    field({ name: 'where', label: 'Where', type: 'map' }),
    field({ name: 'empty', label: 'Empty', type: 'text' }),
  ]

  const values = {
    featured: false,
    kind: 'video',
    day: '2026-10-10',
    cta: { url: 'https://example.com/buy', title: 'Buy', target: '_blank' },
    hero: 42,
    shots: [42, 43],
    tags: ['new', 'sale'],
    rows: [{ title: 'First' }, { title: 'Second' }],
    where: { lat: -33.8, lng: 151.2, zoom: 12, address: 'Sydney' },
  }
  const mediaUrls = new Map<number, string>([
    [42, 'https://cdn.test/42.jpg'],
    [43, 'https://cdn.test/43.jpg'],
  ])

  it('stringifies every type', () => {
    const ctx = buildCustomFieldContext(defs, values, { mediaUrls })
    expect(ctx['field:featured']).toBe('No')
    expect(ctx['field:kind']).toBe('Video')
    expect(ctx['field:day']).toBe('2026-10-10')
    expect(ctx['field:cta']).toBe('https://example.com/buy')
    expect(ctx['field:cta.title']).toBe('Buy')
    expect(ctx['field:hero']).toBe('https://cdn.test/42.jpg')
    expect(ctx['field:shots']).toBe('https://cdn.test/42.jpg, https://cdn.test/43.jpg')
    expect(ctx['field:tags']).toBe('New, Sale')
    expect(ctx['field:where']).toBe('Sydney')
    expect(ctx['field:where.lat']).toBe('-33.8')
    expect(ctx['field:empty']).toBe('')
  })

  it('exposes nested paths, gallery items and repeater rows', () => {
    const ctx = buildCustomFieldContext(defs, values, { mediaUrls })
    expect(ctx['field:rows.0.title']).toBe('First')
    expect(ctx['field:rows.1.title']).toBe('Second')
    expect(ctx['field:shots.1']).toBe('https://cdn.test/43.jpg')
  })

  it('falls back to a guessed stringify with no definitions', () => {
    const ctx = buildGuessedCustomContext({ flag: true, n: 3, cta: { url: 'https://x.test' } })
    expect(ctx).toEqual({ 'field:flag': 'Yes', 'field:n': '3', 'field:cta': 'https://x.test' })
  })

  it('collects every referenced media id once', () => {
    expect(collectMediaIds(defs, values).sort()).toEqual([42, 43])
  })

  it('resolves tags on a page, keeps unknown text, and leaves a loop template to its items', () => {
    const tags = { ...buildCustomFieldContext(defs, values, { mediaUrls }), ...buildMergeContext({ title: 'Hello', slug: 'hi' }, 'pages') }
    expect(resolveTags('Hi {{title}} {{field:kind}}', tags, { keepUnknown: true })).toBe('Hi Hello Video')
    expect(resolveTags('{{not_a_tag}} and {{field:missing}}', tags, { keepUnknown: true })).toBe('{{not_a_tag}} and ')
    expect(resolveTags('{{not_a_tag}}', tags)).toBe('')

    const blocks = [
      { blockType: 'text', body: 'Title: {{title}}' },
      { blockType: 'loop', template: [{ blockType: 'text', body: '{{title}} per item' }] },
    ]
    const out = resolveDocumentBlocks(blocks, tags) as Array<Record<string, unknown>>
    expect(out[0].body).toBe('Title: Hello')
    expect(out[1].template).toEqual([{ blockType: 'text', body: '{{title}} per item' }])
  })

  it('stringifyFieldValue reads definitions for the checkbox and select cases', () => {
    expect(stringifyFieldValue(field({ name: 'b', type: 'checkbox', trueLabel: 'Yes please' }), true)).toBe('Yes please')
    expect(stringifyFieldValue(undefined, undefined)).toBe('')
  })
})

describe('oEmbed preview URLs', () => {
  it('builds embeds for allowed providers only', () => {
    expect(oembedEmbedUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe('https://www.youtube.com/embed/abcdefghijk')
    expect(oembedEmbedUrl('https://youtu.be/abcdefghijk')).toBe('https://www.youtube.com/embed/abcdefghijk')
    expect(oembedEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789')
    expect(oembedEmbedUrl('https://open.spotify.com/track/xyz')).toBe('https://open.spotify.com/embed/track/xyz')
    expect(oembedEmbedUrl('https://example.com/video')).toBeNull()
  })
})

describe('server hook', () => {
  beforeEach(() => {
    serverMock.loadFieldGroups.mockReset()
  })

  it('fails open when the groups cannot load', async () => {
    serverMock.loadFieldGroups.mockRejectedValue(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const value = { anything: 'kept' }
    await expect(prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value, doc: {} })).resolves.toBe(value)
    errorSpy.mockRestore()
  })

  it('rejects a save with every missing required label', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([
      group({ id: 1, fields: [field({ name: 'price', label: 'Price', type: 'number', required: true }), field({ name: 'sku', label: 'SKU', type: 'text', required: true })] }),
    ])
    const error = await prepareCustomFieldsForSave({ collection: 'pages', operation: 'create', value: {}, doc: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).errors.map((e) => e.path)).toEqual(['Price', 'SKU'])
  })

  it('applies defaults and drops hidden values on create', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([
      group({
        id: 2,
        fields: [
          field({ name: 'kind', label: 'Kind', type: 'text', defaultValue: 'video' }),
          field({ name: 'url', label: 'URL', type: 'url', conditions: [[{ field: 'kind', operator: 'equals', value: 'audio' }]] }),
        ],
      }),
    ])
    const saved = await prepareCustomFieldsForSave({ collection: 'pages', operation: 'create', value: { url: 'https://x.test' }, doc: {} })
    expect(saved).toEqual({ kind: 'video' })
  })

  it('does not validate an update that does not include custom fields', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([group({ id: 3, fields: [field({ name: 'must', label: 'Must', type: 'text', required: true })] })])
    await expect(prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value: undefined, doc: {} })).resolves.toBeUndefined()
  })
})

describe('admin routes', () => {
  beforeEach(() => {
    adminMock.getAdminContext.mockReset()
  })

  it('refuses the field groups list to users without field-groups read', async () => {
    adminMock.getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false, user: null })
    const res = await getFieldGroupsRoute(new Request('http://x/api/admin-field-groups?collection=pages'))
    expect(res.status).toBe(403)
  })

  it('refuses options writes without field-groups update', async () => {
    adminMock.getAdminContext.mockResolvedValue({ isAdmin: false, can: (_r: string, a: string) => a === 'read', user: null })
    const res = await postOptionsRoute(new Request('http://x/api/admin-field-options/contact', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ slug: 'contact' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('options storage', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    holder.db = drizzle(proxy.env.D1) as unknown
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('validates slugs', () => {
    expect(isValidOptionSlug('site-contact')).toBe(true)
    expect(isValidOptionSlug('Bad Slug')).toBe(false)
    expect(isValidOptionSlug('../etc')).toBe(false)
  })

  it('saves and reads back an option, and upserts on the second save', async () => {
    await saveOptionValues('contact', { phone: '0400 000 000' })
    expect(await getOption('contact', 'phone')).toBe('0400 000 000')
    await saveOptionValues('contact', { phone: '0411 111 111' })
    expect(await getOption('contact', 'phone')).toBe('0411 111 111')
    expect(await getOption('contact', 'missing')).toBeUndefined()
  })
})

describe('merge tags: prototype keys', () => {
  it('a tag that names an Object.prototype member resolves to nothing, not to the prototype', () => {
    expect(resolveTags('[{{constructor}}][{{toString}}][{{__proto__}}]', { title: 'x' })).toBe('[][][]')
  })

  it('own keys still resolve', () => {
    expect(resolveTags('{{title}}', { title: 'Hello' })).toBe('Hello')
  })
})

describe('safe URLs for href and src', () => {
  it('allows http, https, mailto, tel, root-relative paths and in-page anchors', () => {
    for (const ok of ['https://a.test/x', 'http://a.test', 'mailto:hi@a.test', 'tel:+61400000000', '/shop', '#top']) {
      expect(safeUrl(ok), ok).toBe(ok)
    }
  })

  it('refuses script, data and protocol-relative URLs, including tricks with whitespace and control characters', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,hi', 'vbscript:x', '//evil.test/x', '/\\evil.test', 'ftp://a.test', '']) {
      expect(safeUrl(bad), bad).toBeNull()
    }
    expect(safeUrl(null)).toBeNull()
    expect(safeUrl(42)).toBeNull()
  })

  it('a hero, a CTA banner and a heading link render no href for an unsafe URL', () => {
    const hero = renderToStaticMarkup(createElement(HeroBlock, { heading: 'Hi', primaryCtaLabel: 'Go', primaryCtaUrl: 'javascript:alert(1)' }))
    expect(hero).not.toContain('javascript')
    const cta = renderToStaticMarkup(createElement(CtaBannerBlock, { heading: 'Hi', buttonLabel: 'Go', buttonUrl: 'data:text/html,x' }))
    expect(cta).not.toContain('data:')
    const heading = renderToStaticMarkup(createElement(HeadingElement, { text: 'Hi', link: 'javascript:alert(1)' }))
    expect(heading).not.toContain('javascript')
  })

  it('a hero with a safe URL still renders its link', () => {
    const hero = renderToStaticMarkup(createElement(HeroBlock, { heading: 'Hi', primaryCtaLabel: 'Go', primaryCtaUrl: 'https://a.test/buy' }))
    expect(hero).toContain('href="https://a.test/buy"')
  })
})

describe('url and link fields accept the same safe schemes', () => {
  const messages = (defs: CustomFieldDef[], values: Record<string, unknown>) => validateFieldValues(defs, values).map((p) => `${p.path}: ${p.message}`)
  it('url fields accept mailto, tel and root-relative paths, and refuse script URLs', () => {
    expect(messages([field({ name: 'u', type: 'url' })], { u: 'mailto:hi@a.test' })).toEqual([])
    expect(messages([field({ name: 'u', type: 'url' })], { u: 'tel:+61400000000' })).toEqual([])
    expect(messages([field({ name: 'u', type: 'url' })], { u: '/faq' })).toEqual([])
    expect(messages([field({ name: 'u', type: 'url' })], { u: 'javascript:alert(1)' })).toHaveLength(1)
  })

  it('link fields check the same way', () => {
    expect(messages([field({ name: 'l', type: 'link' })], { l: { url: 'mailto:hi@a.test' } })).toEqual([])
    expect(messages([field({ name: 'l', type: 'link' })], { l: { url: 'javascript:alert(1)' } })).toHaveLength(1)
    expect(messages([field({ name: 'l', type: 'link', required: true })], { l: { url: '' } })).toHaveLength(1)
  })
})

describe('location rules: one bad rule drops its group', () => {
  it('a group with an unknown param is dropped whole, and good groups survive', () => {
    const groups = normalizeLocation([
      [
        { param: 'collection', operator: 'equals', value: 'pages' },
        { param: 'bogus', operator: 'equals', value: 'x' },
      ],
      [{ param: 'collection', operator: 'equals', value: 'posts' }],
    ])
    expect(groups).toEqual([[{ param: 'collection', operator: 'equals', value: 'posts' }]])
  })

  it('a group with an empty value is dropped whole too', () => {
    const groups = normalizeLocation([[{ param: 'collection', operator: 'equals', value: 'pages' }, { param: 'postTag', operator: 'equals', value: '' }]])
    expect(groups).toEqual([])
  })
})

describe('server hook: fail closed for non-admins, and publishing checks stored values', () => {
  beforeEach(() => {
    serverMock.loadFieldGroups.mockReset()
  })

  it('refuses a save by a non-admin when the groups cannot load', async () => {
    serverMock.loadFieldGroups.mockRejectedValue(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = await prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value: { a: 1 }, doc: {}, userRoles: ['editor'] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).errors[0].message).toBe('Custom fields could not be validated; try again.')
    errorSpy.mockRestore()
  })

  it('an admin, or a system write with no user, still goes through when the groups cannot load', async () => {
    serverMock.loadFieldGroups.mockRejectedValue(new Error('db down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const value = { a: 1 }
    await expect(prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value, doc: {}, userRoles: ['admin'] })).resolves.toBe(value)
    await expect(prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value, doc: {} })).resolves.toBe(value)
    errorSpy.mockRestore()
  })

  it('publishing without a customFields payload checks the stored values', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([group({ id: 5, fields: [field({ name: 'sku', label: 'SKU', type: 'text', required: true })] })])
    const error = await prepareCustomFieldsForSave({
      collection: 'pages',
      operation: 'update',
      value: undefined,
      doc: { _status: 'published', customFields: {} },
      userRoles: ['editor'],
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).errors.map((e) => e.path)).toEqual(['SKU'])
  })

  it('publishing with valid stored values passes and leaves the stored values in place', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([group({ id: 6, fields: [field({ name: 'sku', label: 'SKU', type: 'text', required: true })] })])
    await expect(
      prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value: undefined, doc: { _status: 'published', customFields: { sku: 'A1' } }, userRoles: ['editor'] }),
    ).resolves.toBeUndefined()
  })

  it('a draft save without customFields is still not validated', async () => {
    serverMock.loadFieldGroups.mockResolvedValue([group({ id: 7, fields: [field({ name: 'sku', label: 'SKU', type: 'text', required: true })] })])
    await expect(prepareCustomFieldsForSave({ collection: 'pages', operation: 'update', value: undefined, doc: { _status: 'draft' }, userRoles: ['editor'] })).resolves.toBeUndefined()
  })
})

describe('definedValueKeys', () => {
  it('collects every name at any depth, including group, repeater and layout sub-fields', () => {
    const keys = definedValueKeys([
      field({ name: 'top', type: 'text' }),
      field({ name: 'box', type: 'group', subFields: [field({ name: 'inner', type: 'text' })] }),
      field({ name: 'rows', type: 'repeater', subFields: [field({ name: 'row_text', type: 'text' })] }),
      field({ name: 'flex', type: 'flexible', layouts: [{ name: 'hero', label: 'Hero', subFields: [field({ name: 'hero_title', type: 'text' })] }] }),
    ])
    expect([...keys].sort()).toEqual(['box', 'flex', 'hero_title', 'inner', 'row_text', 'rows', 'top'].sort())
  })
})

describe('options route: only defined keys, and size caps', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    holder.db = drizzle(proxy.env.D1) as unknown
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  beforeEach(() => {
    adminMock.getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, user: null })
    serverMock.loadFieldGroups.mockResolvedValue([
      group({
        id: 20,
        location: [[{ param: 'optionsPage', operator: 'equals', value: 'contact' }]],
        fields: [field({ name: 'phone', label: 'Phone', type: 'text' })],
      }),
    ])
  })

  const post = (body: string) =>
    postOptionsRoute(new Request('http://x/api/admin-field-options/contact', { method: 'POST', body }), { params: Promise.resolve({ slug: 'contact' }) })

  it('keeps the defined key and ignores an unknown one', async () => {
    const res = await post(JSON.stringify({ values: { phone: '0400 000 000', injected: 'nope' } }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { values: Record<string, unknown> }
    expect(json.values).toEqual({ phone: '0400 000 000' })
    expect(await getOption('contact', 'injected')).toBeUndefined()
  })

  it('refuses more than 200 keys', async () => {
    const values = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, 'v']))
    const res = await post(JSON.stringify({ values }))
    expect(res.status).toBe(400)
  })

  it('refuses a body over 100KB', async () => {
    const res = await post(JSON.stringify({ values: { phone: 'x'.repeat(101 * 1024) } }))
    expect(res.status).toBe(413)
  })
})

describe('loop block: only published events', () => {
  it('asks for published events only', async () => {
    const find = vi.fn(async (_args: Record<string, unknown>) => ({ docs: [] as unknown[] }))
    engineMock.getEngine.mockResolvedValue({ findByID: vi.fn(async () => ({ blocks: [{ id: 'x', blockType: 'richText' }] })), find })
    await LoopBlock({ template: 1, source: 'events', renderNode: () => null })
    expect(find).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(find.mock.calls[0]?.[0].where)).toContain('{"_status":{"equals":"published"}}')
  })
})

describe('blog post lookup: published only', () => {
  it('asks for a published post with the slug, so a draft is never found here', async () => {
    const find = vi.fn(async (_args: Record<string, unknown>) => ({ docs: [] as unknown[] }))
    engineMock.getEngine.mockResolvedValue({ find })
    const metadata = await blogPostMetadata({ params: Promise.resolve({ slug: 'spring' }) })
    expect(metadata).toEqual({})
    expect(find).toHaveBeenCalledTimes(1)
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      collection: 'posts',
      where: { and: [{ slug: { equals: 'spring' } }, { _status: { equals: 'published' } }] },
    })
  })
})
