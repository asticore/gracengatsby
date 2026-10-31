import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { matchesLocation } from '@/features/customFields/location'
import { sanitizeConditions } from '@/features/siteTemplates/conditions'
import { CONDITION_KINDS } from '@/features/siteTemplates/conditionsSummary'
import { computeTemplateCoverage } from '@/features/siteTemplates/coverage'
import { OPTIONAL_KINDS, PUBLIC_PREVIEW_PATH, SITE_TEMPLATE_KINDS, TEMPLATE_TYPE_TABS } from '@/features/siteTemplates/kinds'
import { stripContentSlots, stripPartNesting, parseTemplatePartId, templatePartIdsIn } from '@/features/siteTemplates/nodes'
import { pickSiteTemplate } from '@/features/siteTemplates/pick'
import type { SiteTemplate } from '@/features/siteTemplates/types'
import { specificityOf } from '@/features/siteTemplates/conditions'
import { STARTERS } from '@/features/siteTemplates/starters'
import { buildHubRows, HUB_COLUMNS, HUB_DEFAULT_COLUMNS } from '@/features/templatesHub/rows'
import { SidebarLayout } from '@/features/siteTemplates/SidebarLayout'

const block = (blocks: unknown[]) => blocks
const text = (id: string) => ({ blockType: 'element', elementType: 'heading', props: { text: id }, _id: id })
const part = (templateId: unknown) => ({ blockType: 'element', elementType: 'template-part', props: { templateId } })
const slot = { blockType: 'element', elementType: 'content-slot', props: {} }
const section = (blocks: unknown[]) => ({ blockType: 'section', columns: [{ width: 12, blocks }] })

const tpl = (over: Partial<SiteTemplate> & { id: number }): SiteTemplate => ({
  name: `t${over.id}`,
  kind: 'header',
  enabled: true,
  priority: 10,
  conditions: [],
  blocks: [text('x')],
  ...over,
})

describe('resolution order', () => {
  it('a higher priority wins over a more specific template', () => {
    const general = tpl({ id: 1, priority: 20, conditions: [[{ param: 'path', operator: 'equals', value: '/shop' }]] })
    const fallback = tpl({ id: 2, priority: 5 })
    expect(pickSiteTemplate([fallback, general], 'header', { path: '/shop' })?.id).toBe(1)
  })

  it('at equal priority the more specific conditions win over the fallback', () => {
    const fallback = tpl({ id: 1 })
    const specific = tpl({
      id: 9,
      conditions: [[{ param: 'path', operator: 'equals', value: '/shop' }, { param: 'language', operator: 'equals', value: 'fr' }]],
    })
    expect(pickSiteTemplate([fallback, specific], 'header', { path: '/shop', language: 'fr' })?.id).toBe(9)
  })

  it('at equal priority and specificity the lowest id wins', () => {
    const a = tpl({ id: 5, conditions: [[{ param: 'path', operator: 'equals', value: '/a' }]] })
    const b = tpl({ id: 3, conditions: [[{ param: 'path', operator: 'equals', value: '/a' }]] })
    expect(pickSiteTemplate([a, b], 'header', { path: '/a' })?.id).toBe(3)
  })

  it('falls back to the everywhere template when no specific one matches', () => {
    const fallback = tpl({ id: 1 })
    const shop = tpl({ id: 2, priority: 50, conditions: [[{ param: 'path', operator: 'equals', value: '/shop' }]] })
    expect(pickSiteTemplate([fallback, shop], 'header', { path: '/about' })?.id).toBe(1)
  })

  it('skips disabled, empty and invalid templates and other kinds', () => {
    const off = tpl({ id: 1, enabled: false, priority: 99 })
    const empty = tpl({ id: 2, priority: 98, blocks: [] })
    const invalid = tpl({ id: 3, priority: 97, conditions: 'not json [' as unknown as unknown[] })
    const footer = tpl({ id: 4, kind: 'footer', priority: 96 })
    const ok = tpl({ id: 5, priority: 1 })
    expect(pickSiteTemplate([off, empty, invalid, footer, ok], 'header', {})?.id).toBe(5)
  })

  it('returns null when nothing matches', () => {
    expect(pickSiteTemplate([tpl({ id: 1, conditions: [[{ param: 'path', operator: 'equals', value: '/x' }]] })], 'header', { path: '/y' })).toBeNull()
  })

  it('specificity counts the rules in the most specific group', () => {
    expect(specificityOf([])).toBe(0)
    expect(specificityOf([[{ param: 'path', operator: 'equals', value: '/a' }]])).toBe(1)
    expect(specificityOf([[{ param: 'path', operator: 'equals', value: '/a' }], [{ param: 'domain', operator: 'equals', value: 'x.com' }, { param: 'language', operator: 'equals', value: 'fr' }]])).toBe(2)
    expect(specificityOf('broken [')).toBe(0)
  })
})

describe('domain and language conditions', () => {
  it('are accepted conditions with hints in the editor', () => {
    const params = CONDITION_KINDS.map((k) => k.param)
    expect(params).toContain('domain')
    expect(params).toContain('language')
    for (const param of ['domain', 'language'] as const) {
      expect(sanitizeConditions([[{ param, operator: 'equals', value: 'x' }]]).valid).toBe(true)
    }
  })

  it('scope a template to a host, case-insensitively', () => {
    const groups = [[{ param: 'domain' as const, operator: 'equals' as const, value: 'Shop.Example.com' }]]
    expect(matchesLocation(groups, { templateKind: 'header', domain: 'shop.example.com' })).toBe(true)
    expect(matchesLocation(groups, { templateKind: 'header', domain: 'example.com' })).toBe(false)
    expect(matchesLocation(groups, { templateKind: 'header', domain: null })).toBe(false)
    expect(matchesLocation(groups, { templateKind: 'header' })).toBe(false)
  })

  it('scope a template to a language and support "is not"', () => {
    const fr = [[{ param: 'language' as const, operator: 'equals' as const, value: 'fr' }]]
    const notFr = [[{ param: 'language' as const, operator: 'notEquals' as const, value: 'fr' }]]
    expect(matchesLocation(fr, { templateKind: 'header', language: 'FR' })).toBe(true)
    expect(matchesLocation(fr, { templateKind: 'header', language: 'de' })).toBe(false)
    expect(matchesLocation(notFr, { templateKind: 'header', language: 'de' })).toBe(true)
    expect(matchesLocation(notFr, { templateKind: 'header', language: 'fr' })).toBe(false)
  })

  it('pick the French header on a French page and the default elsewhere', () => {
    const fallback = tpl({ id: 1, priority: 10 })
    const french = tpl({ id: 2, priority: 10, conditions: [[{ param: 'language', operator: 'equals', value: 'fr' }]] })
    expect(pickSiteTemplate([fallback, french], 'header', { language: 'fr' })?.id).toBe(2)
    expect(pickSiteTemplate([fallback, french], 'header', { language: 'en' })?.id).toBe(1)
  })
})

describe('sidebar kinds', () => {
  it('are registered, have a tab, preview on the home page, and are optional', () => {
    expect(SITE_TEMPLATE_KINDS).toEqual(expect.arrayContaining(['sidebar-left', 'sidebar-right']))
    expect(TEMPLATE_TYPE_TABS.find((t) => t.id === 'sidebar')?.kinds).toEqual(['sidebar-left', 'sidebar-right'])
    expect(PUBLIC_PREVIEW_PATH['sidebar-left']).toBe('/')
    expect(OPTIONAL_KINDS).toEqual(expect.arrayContaining(['sidebar-left', 'sidebar-right']))
  })

  it('have one starter each and no coverage warning when missing', () => {
    for (const kind of ['sidebar-left', 'sidebar-right'] as const) {
      expect(STARTERS.filter((s) => s.kind === kind)).toHaveLength(1)
    }
    const warnings = computeTemplateCoverage([])
    expect(warnings.some((w) => w.kind === 'sidebar-left' || w.kind === 'sidebar-right')).toBe(false)
  })

  it('still report an overlap between two sidebars with equal conditions', () => {
    const a = { id: 1, kind: 'sidebar-left' as const, priority: 10, conditions: [] as unknown[], blocks: [text('a')] }
    const b = { id: 2, kind: 'sidebar-left' as const, priority: 10, conditions: [] as unknown[], blocks: [text('b')] }
    expect(computeTemplateCoverage([a, b]).some((w) => w.code === 'overlap' && w.kind === 'sidebar-left')).toBe(true)
  })
})

describe('template part nodes', () => {
  it('reads ids only when they are positive whole numbers', () => {
    expect(parseTemplatePartId(12)).toBe('12')
    expect(parseTemplatePartId('12')).toBe('12')
    expect(parseTemplatePartId(0)).toBeNull()
    expect(parseTemplatePartId(-3)).toBeNull()
    expect(parseTemplatePartId(1.5)).toBeNull()
    expect(parseTemplatePartId('abc')).toBeNull()
    expect(parseTemplatePartId(undefined)).toBeNull()
  })

  it('finds part ids inside sections at any depth, in order', () => {
    const blocks = block([part(4), section([text('a'), part('7')]), section([{ blockType: 'section', columns: [{ width: 12, blocks: [part(9)] }] }]), part('nope')])
    expect(templatePartIdsIn(blocks)).toEqual(['4', '7', '9'])
  })

  it('drops parts nested in a part, and content slots, but keeps the rest', () => {
    const blocks = block([text('top'), part(3), section([text('in'), part(4), slot, section([{ blockType: 'section', columns: [{ width: 12, blocks: [part(5), text('deep')] }] }])])])
    const out = stripPartNesting(blocks) as Array<{ blockType: string }>
    expect(templatePartIdsIn(out)).toEqual([])
    expect(JSON.stringify(out)).toContain('deep')
    expect(JSON.stringify(out)).not.toContain('content-slot')
  })

  it('keeps parts for a page, where only content slots are stripped (headers and footers)', () => {
    const blocks = block([part(3), slot])
    expect(templatePartIdsIn(stripContentSlots(blocks))).toEqual(['3'])
  })
})

describe('where used on the Templates hub', () => {
  const header = tpl({ id: 1, name: 'Header', kind: 'header' })
  const sidebar = tpl({ id: 2, name: 'Blog sidebar', kind: 'sidebar-right', blocks: [part(1), text('side')] })
  const page = { id: 40, title: 'Home', blocks: [section([part(2)]), section([part(1)])] }
  const template = { id: 8, name: 'Single post', kind: 'single-post', blocks: [section([part(1)])] }

  it('has a Where used column shown by default', () => {
    expect(HUB_COLUMNS.map((c) => c.name)).toContain('whereUsed')
    expect(HUB_DEFAULT_COLUMNS).toContain('whereUsed')
  })

  it('lists each page and template that places a part, once per place', () => {
    const rows = buildHubRows({ siteTemplates: [header, sidebar], pages: [page as never], pageTemplates: [], reusableSections: [] })
    const headerRow = rows.find((r) => r.key === 'site-templates:1')!
    expect(headerRow.usedIn.map((u) => u.name)).toEqual(['Home', 'Blog sidebar'])
    expect(headerRow.usedIn[0].href).toMatch(/\/40$/)
    // The blog sidebar is itself placed in the home page, and nothing places the header's neighbour.
    const sidebarRow = rows.find((r) => r.key === 'site-templates:2')!
    expect(sidebarRow.usedIn.map((u) => u.name)).toEqual(['Home'])
    expect(rows.find((r) => r.key === 'site-templates:1')!.usedIn.map((u) => u.name)).toEqual(['Home', 'Blog sidebar'])
  })

  it('counts a part placed in another site template and in a page template', () => {
    const rows = buildHubRows({ siteTemplates: [header, template as never], pages: [], pageTemplates: [{ id: 3, name: 'Starter', blocks: [part(1)] }] })
    const headerRow = rows.find((r) => r.key === 'site-templates:1')!
    expect(headerRow.usedIn.map((u) => u.name).sort()).toEqual(['Single post', 'Starter'])
  })

  it('does not list pages or templates for rows that are not parts (page templates have no usage column)', () => {
    const rows = buildHubRows({ siteTemplates: [], pages: [page as never], pageTemplates: [{ id: 3, name: 'Starter', blocks: [part(1)] }] })
    expect(rows.every((r) => r.usedIn.length === 0)).toBe(true)
  })
})

describe('sidebar layout', () => {
  it('renders the content unchanged with no sidebars', () => {
    expect(renderToStaticMarkup(React.createElement(SidebarLayout, { left: null, right: null }, 'BODY'))).toBe('BODY')
  })

  it('places the left sidebar before and the right sidebar after the content', () => {
    const html = renderToStaticMarkup(React.createElement(SidebarLayout, { left: 'L', right: 'R' }, 'BODY'))
    expect(html.indexOf('data-sidebar="left"')).toBeLessThan(html.indexOf('BODY'))
    expect(html.indexOf('BODY')).toBeLessThan(html.indexOf('data-sidebar="right"'))
  })
})

describe('template part picker (no free-text id)', () => {
  it('the template part field is a select of site templates, not a number', async () => {
    const { TEMPLATE_PART_ELEMENTS } = await import('@/lib/elements/templatePartDefs')
    const field = TEMPLATE_PART_ELEMENTS[0].fields.find((f) => f.name === 'templateId')
    expect(field).toMatchObject({ type: 'select', optionsUrl: '/api/admin-site-templates' })
  })

  it('a part saved with a numeric id (before the picker) still parses', () => {
    expect(parseTemplatePartId(7)).toBe('7')
    expect(parseTemplatePartId('7')).toBe('7')
    expect(parseTemplatePartId('seven')).toBeNull()
  })
})
