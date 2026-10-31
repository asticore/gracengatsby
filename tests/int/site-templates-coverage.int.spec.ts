// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SiteTemplates } from '@/collections/SiteTemplates'
import type { LocationGroups } from '@/fields/customFields/types'
import { computeTemplateCoverage, coversEverywhere, isInUse, MISSING_MESSAGES, type CoverageTemplate } from '@/features/siteTemplates/coverage'
import { KIND_LABELS, PUBLIC_PREVIEW_PATH, SITE_TEMPLATE_KINDS, TEMPLATE_TYPE_TABS, type SiteTemplateKind } from '@/features/siteTemplates/kinds'

const BLOCKS: unknown[] = [{ blockType: 'section' }]
let nextId = 1

/** A usable template of a kind unless overridden. */
const tpl = (kind: SiteTemplateKind, over: Partial<CoverageTemplate> = {}): CoverageTemplate => ({
  id: nextId++,
  name: `${KIND_LABELS[kind]} one`,
  kind,
  enabled: true,
  priority: 10,
  conditions: [],
  blocks: BLOCKS,
  ...over,
})

const on = (path: string): LocationGroups => [[{ param: 'path', operator: 'equals', value: path }]]
const off = (path: string): LocationGroups => [[{ param: 'path', operator: 'notEquals', value: path }]]

/** All warnings for one kind. */
const forKind = (warnings: ReturnType<typeof computeTemplateCoverage>, kind: SiteTemplateKind) => warnings.filter((w) => w.kind === kind)

/** Every kind except header and footer has a template in use, so only the rule under test shows. */
const allKindsCovered = (extra: CoverageTemplate[] = []): CoverageTemplate[] => [
  ...SITE_TEMPLATE_KINDS.filter((k) => k !== 'header' && k !== 'footer').map((k) => tpl(k)),
  ...extra,
]

describe('computeTemplateCoverage: missing kinds', () => {
  it('warns for every kind when there are no templates, in kind order', () => {
    const warnings = computeTemplateCoverage([])
    // Loop item templates are drawn by a Loop grid, and sidebars are optional, so neither warns.
    expect(warnings.map((w) => w.kind)).toEqual(SITE_TEMPLATE_KINDS.filter((k) => k !== 'loop' && k !== 'sidebar-left' && k !== 'sidebar-right'))
    expect(warnings.every((w) => w.code === 'missing')).toBe(true)
  })

  it('gives the plain-English line for the header, footer and 404', () => {
    const warnings = computeTemplateCoverage([])
    expect(forKind(warnings, 'footer')[0].message).toBe('No footer: the site shows the default footer on every page.')
    expect(forKind(warnings, 'header')[0].message).toBe('No header: the site shows the default header on every page.')
    expect(forKind(warnings, 'not-found')[0].message).toMatch(/^No 404 template: /)
  })

  it('is silent for a kind with a template in use', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer')]))
    expect(warnings).toEqual([])
  })

  it('counts a null enabled flag as on, like the resolver', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header', { enabled: null }), tpl('footer')]))
    expect(warnings).toEqual([])
  })

  it('says a switched-off template exists but is not used', () => {
    const warnings = computeTemplateCoverage([tpl('footer', { enabled: false })])
    const footer = forKind(warnings, 'footer')[0]
    expect(footer.code).toBe('missing')
    expect(footer.templateIds).toHaveLength(1)
    expect(footer.message).toContain('exists but is switched off, empty or has invalid conditions')
  })

  it('treats a template with no blocks as not in use', () => {
    expect(isInUse(tpl('footer', { blocks: [] }))).toBe(false)
    expect(isInUse(tpl('footer', { blocks: null }))).toBe(false)
    expect(computeTemplateCoverage([tpl('footer', { blocks: [] })]).some((w) => w.kind === 'footer' && w.code === 'missing')).toBe(true)
  })

  it('treats invalid conditions as not in use (fails closed)', () => {
    const bad = tpl('footer', { conditions: [[{ param: 'nope', operator: 'equals', value: 'x' }]] })
    expect(isInUse(bad)).toBe(false)
    const junk = tpl('footer', { conditions: 'not json' })
    expect(isInUse(junk)).toBe(false)
  })

  it('accepts conditions stored as a JSON string', () => {
    const stored = tpl('footer', { conditions: JSON.stringify(on('/shop')) })
    expect(isInUse(stored)).toBe(true)
  })

  it('has a message for every kind', () => {
    expect(Object.keys(MISSING_MESSAGES).sort()).toEqual([...SITE_TEMPLATE_KINDS].sort())
    for (const kind of SITE_TEMPLATE_KINDS) expect(MISSING_MESSAGES[kind]).toMatch(/^No /)
  })
})

describe('computeTemplateCoverage: header and footer whole-site coverage', () => {
  it('warns when the only footer applies to /shop, saying what other pages show', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header', { name: 'Site header' }), tpl('footer', { name: 'Shop footer', conditions: on('/shop') })]))
    expect(warnings).toHaveLength(1)
    const [w] = warnings
    expect(w.code).toBe('partial')
    expect(w.kind).toBe('footer')
    expect(w.templateIds).toHaveLength(1)
    expect(w.message).toContain('"Shop footer" applies when page path is "/shop"')
    expect(w.message).toContain('Other pages have no footer template, so they show the default footer.')
  })

  it('does not warn when conditions are empty (everywhere for the type)', () => {
    expect(computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: [] })]))).toEqual([])
  })

  it('treats a templateKind rule that matches this kind as always true', () => {
    const everywhere: LocationGroups = [[{ param: 'templateKind', operator: 'equals', value: 'footer' }]]
    expect(computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: everywhere })]))).toEqual([])
  })

  it('treats a templateKind rule for another kind as never matching', () => {
    const elsewhere: LocationGroups = [[{ param: 'templateKind', operator: 'equals', value: 'header' }]]
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: elsewhere })]))
    // The footer template is in use (conditions are valid) but matches nowhere: it is not covering the site.
    expect(forKind(warnings, 'footer')[0].code).toBe('partial')
  })

  it('does not warn when two restricted footers together cover the site with is and is-not', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: on('/shop') }), tpl('footer', { conditions: off('/shop') })]))
    expect(warnings).toEqual([])
  })

  it('does not warn when two is-not rules on different values cover the site', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: off('/shop') }), tpl('footer', { conditions: off('/blog') })]))
    expect(warnings).toEqual([])
  })

  it('warns when two footers are restricted to different pages only', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer', { conditions: on('/shop') }), tpl('footer', { conditions: on('/blog') })]))
    const footer = forKind(warnings, 'footer')
    expect(footer).toHaveLength(1)
    expect(footer[0].code).toBe('partial')
    expect(footer[0].templateIds).toHaveLength(2)
  })

  it('warns for a header with a single narrow OR group', () => {
    const groups: LocationGroups = [[{ param: 'path', operator: 'equals', value: '/shop' }], [{ param: 'path', operator: 'equals', value: '/blog' }]]
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header', { conditions: groups }), tpl('footer')]))
    expect(forKind(warnings, 'header')[0].code).toBe('partial')
  })

  it('does not count multi-rule groups towards full coverage', () => {
    const narrow: LocationGroups = [[{ param: 'path', operator: 'notEquals', value: '/shop' }, { param: 'postTag', operator: 'equals', value: 'news' }]]
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header', { conditions: narrow }), tpl('footer')]))
    expect(forKind(warnings, 'header')[0].code).toBe('partial')
  })

  it('does not apply the whole-site rule to other kinds', () => {
    const warnings = computeTemplateCoverage(allKindsCovered([tpl('header'), tpl('footer'), tpl('single-post', { conditions: on('/x') })]))
    expect(warnings).toEqual([])
  })

  it('leaves the warning to "missing" when no header is in use', () => {
    const warnings = computeTemplateCoverage([tpl('header', { conditions: on('/shop'), enabled: false })])
    expect(forKind(warnings, 'header').map((w) => w.code)).toEqual(['missing'])
  })
})

describe('coversEverywhere', () => {
  it('is true for an empty group and false for nothing', () => {
    expect(coversEverywhere([[[]]], 'footer')).toBe(true)
    expect(coversEverywhere([], 'footer')).toBe(false)
    expect(coversEverywhere([[]], 'footer')).toBe(false)
  })

  it('is false for one restricted rule', () => {
    expect(coversEverywhere([on('/shop')], 'footer')).toBe(false)
    expect(coversEverywhere([off('/shop')], 'footer')).toBe(false)
  })

  it('is true when is and is-not of the same value are both present', () => {
    expect(coversEverywhere([on('/a'), off('/a')], 'footer')).toBe(true)
  })

  it('is true for is-not on two different values', () => {
    expect(coversEverywhere([off('/a'), off('/b')], 'footer')).toBe(true)
  })

  it('is false for is-not on the same value twice', () => {
    expect(coversEverywhere([off('/a'), off('/a')], 'footer')).toBe(false)
  })

  it('is false when the same param has only different is values', () => {
    expect(coversEverywhere([on('/a'), on('/b')], 'footer')).toBe(false)
  })

  it('does not merge different params', () => {
    expect(coversEverywhere([on('/a'), [[{ param: 'productCategory', operator: 'notEquals', value: '/a' }]]], 'footer')).toBe(false)
  })
})

describe('computeTemplateCoverage: overlapping templates of one kind', () => {
  it('names the winner by priority and the one that is never shown', () => {
    const low = tpl('footer', { name: 'Footer A', priority: 10, conditions: on('/shop') })
    const high = tpl('footer', { name: 'Footer B', priority: 20, conditions: on('/shop') })
    const warnings = computeTemplateCoverage(([tpl('header'), low, high]))
    const overlap = warnings.filter((w) => w.code === 'overlap')
    expect(overlap).toHaveLength(1)
    expect(overlap[0].templateIds).toEqual([high.id, low.id])
    expect(overlap[0].message).toContain('"Footer B" (priority 20), "Footer A" (priority 10)')
    expect(overlap[0].message).toContain('"Footer B" is used on those pages because it has the highest priority')
    expect(overlap[0].message).toContain('the others are never shown there')
  })

  it('says the lower id wins a priority tie', () => {
    const first = tpl('single-post', { name: 'Post first', priority: 10 })
    const second = tpl('single-post', { name: 'Post second', priority: 10 })
    const warnings = computeTemplateCoverage(([first, second]))
    const overlap = warnings.find((w) => w.code === 'overlap')
    expect(overlap?.kind).toBe('single-post')
    expect(overlap?.templateIds).toEqual([first.id, second.id])
    expect(overlap?.message).toContain('they have the same priority, so the lower id wins')
  })

  it('matches equal conditions whatever the row and rule order', () => {
    const a = tpl('archive-shop', { name: 'Shop A', conditions: [[{ param: 'path', operator: 'equals', value: '/shop' }, { param: 'postTag', operator: 'equals', value: 'x' }]] satisfies LocationGroups })
    const b = tpl('archive-shop', { name: 'Shop B', conditions: [[{ param: 'postTag', operator: 'equals', value: 'x' }, { param: 'path', operator: 'equals', value: '/shop' }]] satisfies LocationGroups })
    const overlap = computeTemplateCoverage(([a, b])).filter((w) => w.code === 'overlap')
    expect(overlap).toHaveLength(1)
    expect(overlap[0].templateIds).toHaveLength(2)
  })

  it('groups three equal templates into one warning', () => {
    const [x, y, z] = [tpl('not-found', { name: 'X', priority: 1 }), tpl('not-found', { name: 'Y', priority: 3 }), tpl('not-found', { name: 'Z', priority: 2 })]
    const overlap = computeTemplateCoverage(([x, y, z])).filter((w) => w.code === 'overlap')
    expect(overlap).toHaveLength(1)
    expect(overlap[0].templateIds).toEqual([y.id, z.id, x.id])
    expect(overlap[0].message).toContain('3 404 page templates')
  })

  it('does not warn for templates with different conditions', () => {
    const warnings = computeTemplateCoverage(([tpl('footer', { conditions: on('/a') }), tpl('footer', { conditions: on('/b') }), tpl('header')]))
    expect(warnings.filter((w) => w.code === 'overlap')).toEqual([])
  })

  it('ignores disabled and empty templates when looking for overlaps', () => {
    const warnings = computeTemplateCoverage(([tpl('single-event', { enabled: false }), tpl('single-event', { blocks: [] }), tpl('single-event')]))
    expect(warnings.filter((w) => w.code === 'overlap')).toEqual([])
  })

  it('does not treat the same conditions on different kinds as overlapping', () => {
    const warnings = computeTemplateCoverage(([tpl('archive-blog'), tpl('archive-shop')]))
    expect(warnings.filter((w) => w.code === 'overlap')).toEqual([])
  })
})

describe('computeTemplateCoverage: ordering and robustness', () => {
  it('orders warnings by kind, then by kind of code', () => {
    const warnings = computeTemplateCoverage([tpl('footer', { conditions: on('/shop') }), tpl('footer', { conditions: on('/shop') }), tpl('header', { conditions: on('/a') })])
    const order = warnings.map((w) => `${SITE_TEMPLATE_KINDS.indexOf(w.kind)}:${w.code}`)
    expect(order).toEqual([...order].sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])))
    expect(warnings[0]).toMatchObject({ kind: 'header', code: 'partial' })
  })

  it('does not throw on odd rows and ignores missing names', () => {
    // Missing conditions mean everywhere, so the footer covers the site and only the name fallback is checked.
    const odd = { id: 'abc', kind: 'footer', name: '   ', conditions: undefined, blocks: [{}] } as unknown as CoverageTemplate
    expect(forKind(computeTemplateCoverage([odd]), 'footer')).toEqual([])
    const narrow = { id: 'abc', kind: 'header', name: '   ', conditions: on('/a'), blocks: [{}] } as unknown as CoverageTemplate
    const header = forKind(computeTemplateCoverage([narrow]), 'header')[0]
    expect(header.code).toBe('partial')
    expect(header.message).toContain('"Untitled abc" applies when page path is "/a"')
  })

  it('returns no warnings when every kind has one template in use and none overlap', () => {
    expect(computeTemplateCoverage(SITE_TEMPLATE_KINDS.map((k) => tpl(k)))).toEqual([])
  })
})

describe('admin kinds and tabs', () => {
  it('puts every kind on exactly one dashboard tab', () => {
    const tabKinds = TEMPLATE_TYPE_TABS.flatMap((t) => [...t.kinds])
    expect([...tabKinds].sort()).toEqual([...SITE_TEMPLATE_KINDS].sort())
  })

  it('only offers public previews for kinds that have a public page', () => {
    for (const kind of Object.keys(PUBLIC_PREVIEW_PATH)) expect(SITE_TEMPLATE_KINDS).toContain(kind)
    expect(PUBLIC_PREVIEW_PATH.header).toBe('/')
    expect(PUBLIC_PREVIEW_PATH['single-post']).toBeUndefined()
  })

  it('no longer mounts a list-screen panel: the Templates hub replaces the old dashboard', () => {
    expect(SiteTemplates.admin?.components?.beforeList).toBeUndefined()
  })
})
