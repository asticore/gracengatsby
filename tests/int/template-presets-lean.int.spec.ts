// @vitest-environment node
// Template presets must build only lean base elements: every element type a preset uses
// must exist in the registry and must not be hidden. The Build with AI guide must not name
// any hidden type either. Pure data checks; nothing is rendered or fetched.
import { describe, expect, it } from 'vitest'

import { buildGuide } from '@/features/ai/builderGuide'
import { FORM_ONLY_ELEMENT_TYPES } from '@/features/forms/elementDefs'
import { ELEMENTS, getElementDef } from '@/lib/elements/registry'
import type { SectionNode } from '@/lib/sectionTree'
import { TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'

const HIDDEN_TYPES = ELEMENTS.filter((def) => def.hidden).map((def) => def.type)
/** Old element types hidden from the library in favour of the presets that use them. */
const LEGACY_PRESET_TYPES = ['testimonial', 'team-member', 'pricing-table', 'price-list', 'timeline']

/** Every element node in a preset tree, depth first, including nodes nested in columns. */
function elementsOf(nodes: SectionNode[]): SectionNode[] {
  const out: SectionNode[] = []
  const walk = (list: SectionNode[]) => {
    for (const node of list) {
      if (node.blockType === 'element') out.push(node)
      for (const column of node.columns ?? []) walk((column.blocks ?? []) as SectionNode[])
    }
  }
  walk(nodes)
  return out
}

const presetTypes = (slug: string): string[] => {
  const preset = TEMPLATE_PRESETS.find((p) => p.slug === slug)
  expect(preset, slug).toBeDefined()
  return elementsOf(preset?.blocks() ?? []).map((node) => String(node.elementType))
}

describe('lean template presets', () => {
  it('registry marks the old element types as hidden', () => {
    expect(HIDDEN_TYPES.length).toBeGreaterThan(10)
    expect(HIDDEN_TYPES).toContain('icon-list')
    expect(HIDDEN_TYPES).toContain('count-up')
  })

  it('every element type used by every preset exists in the registry; only the legacy presets use hidden types', () => {
    const registered = new Set(ELEMENTS.map((def) => def.type))
    for (const preset of TEMPLATE_PRESETS) {
      for (const node of elementsOf(preset.blocks())) {
        const type = String(node.elementType)
        expect(registered.has(type), `${preset.slug}: ${type} is not registered`).toBe(true)
        // Hidden types stay in the registry so saved pages render; presets may use only the legacy ones below.
        if (HIDDEN_TYPES.includes(type)) expect(LEGACY_PRESET_TYPES, `${preset.slug}: ${type}`).toContain(type)
        else expect(getElementDef(type)?.hidden ?? false, `${preset.slug}: ${type} is hidden`).toBe(false)
      }
    }
  })

  it('keeps the existing preset ids', () => {
    const slugs = TEMPLATE_PRESETS.map((p) => p.slug)
    for (const slug of ['icon-box-set', 'image-box-set', 'faq-section', 'accordion-section', 'gallery-grid', 'fx-neon-grid', 'team-3up', 'pricing-3-plans']) {
      expect(slugs).toContain(slug)
    }
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('adds testimonial, team member, pricing table, price list and timeline presets', () => {
    const slugs = TEMPLATE_PRESETS.map((p) => p.slug)
    for (const slug of ['testimonial-single', 'team-member-single', 'pricing-table', 'price-list', 'timeline']) {
      expect(slugs).toContain(slug)
    }
    expect(presetTypes('testimonial-single')).toEqual(['testimonial'])
    expect(presetTypes('team-member-single')).toEqual(['team-member'])
    expect(presetTypes('pricing-table')).toContain('pricing-table')
    expect(presetTypes('price-list')).toEqual(['heading', 'price-list', 'divider'])
  })

  it('builds the timeline from heading, text, list and button', () => {
    const types = new Set(presetTypes('timeline'))
    for (const type of ['heading', 'text-editor', 'list', 'button']) {
      expect(types.has(type), type).toBe(true)
    }
  })

  it('uses card elements for the icon and image card sets', () => {
    expect(presetTypes('icon-box-set')).toEqual(['card', 'card', 'card'])
    expect(presetTypes('image-box-set')).toEqual(['card', 'card', 'card'])
    expect(presetTypes('features-3up-icons')).toEqual(['heading', 'card', 'card', 'card'])
  })

  it('builds repeater props as arrays of the nested field names', () => {
    const nested: Record<string, string[]> = {
      'pricing-table': ['text', 'included'],
      list: ['text', 'href'],
      'price-list': ['name', 'description', 'price'],
    }
    for (const preset of TEMPLATE_PRESETS) {
      for (const node of elementsOf(preset.blocks())) {
        const type = String(node.elementType)
        const keys = nested[type]
        if (!keys) continue
        const props = node.props as Record<string, unknown>
        const repeaterName = type === 'pricing-table' ? 'features' : 'items'
        const rows = props[repeaterName]
        expect(Array.isArray(rows), `${preset.slug}: ${type}.${repeaterName}`).toBe(true)
        for (const row of rows as Record<string, unknown>[]) {
          expect(Object.keys(row).sort(), `${preset.slug}: ${type} row`).toEqual([...keys].sort())
        }
      }
    }
  })

  it('draws gallery pictures as a grid section of image elements', () => {
    const gallery = TEMPLATE_PRESETS.find((p) => p.slug === 'gallery-grid')
    const grids = (gallery?.blocks() ?? []).filter((node) => (node.design as { layout?: { display?: string } } | undefined)?.layout?.display === 'grid')
    expect(grids.length).toBe(1)
    expect(elementsOf(grids)).toHaveLength(6)
    for (const node of elementsOf(grids)) expect(node.elementType).toBe('image')
  })
})

describe('guide names no hidden element types', () => {
  const guide = buildGuide({ mode: 'section', siteName: 'Candle Co' })
  const guidePage = buildGuide({ mode: 'page' })

  it('contains no hidden type as a catalogue line, element type or hint name', () => {
    for (const text of [guide, guidePage]) {
      for (const type of HIDDEN_TYPES) {
        expect(new RegExp(`^${type}\\|`, 'm').test(text), type).toBe(false)
        expect(text, type).not.toContain(`"elementType":"${type}"`)
        if (type.includes('-')) expect(text, type).not.toContain(type)
      }
      for (const type of FORM_ONLY_ELEMENT_TYPES) {
        expect(new RegExp(`^${type}\\|`, 'm').test(text), type).toBe(false)
      }
    }
  })

  it('keeps the guide cap and the lean hints', () => {
    expect(guide).toContain('USAGE HINTS')
    expect(guide).toContain('card:')
    expect(guide).toContain('chart:')
    expect(guide).toContain('embed:')
    expect(guide).toContain('pagination:')
  })
})
