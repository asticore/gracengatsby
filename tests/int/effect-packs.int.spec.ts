import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import type { EditorField } from '@/lib/elements/fieldTypes'
import { ELEMENTS, getElementDef } from '@/lib/elements/registry'
import type { SectionNode } from '@/lib/sectionTree'
import { TEMPLATE_CATEGORY_OPTIONS, TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'
import { renderTemplateThumbnailSvg } from '@/views/visualEditor/templateThumbnail'

const PACKS = TEMPLATE_PRESETS.filter((p) => p.slug.startsWith('fx-'))
const SAFE_COLOR = /^[#a-zA-Z0-9(),.%\s/-]{1,64}$/

/** Every design object in a block tree: section designs, column designs and block designs. */
function designsOf(nodes: SectionNode[]): BlockStyle[] {
  const out: BlockStyle[] = []
  const walk = (list: SectionNode[]) => {
    for (const node of list) {
      if (node.design) out.push(node.design)
      for (const column of node.columns ?? []) {
        if (column.design) out.push(column.design)
        walk((column.blocks ?? []) as SectionNode[])
      }
    }
  }
  walk(nodes)
  return out
}

/** Elements of a tree, depth first. */
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

/** Checks one prop value against the field it belongs to. Returns a problem string, or null when it is fine. */
function fieldProblem(field: EditorField, value: unknown): string | null {
  switch (field.type) {
    case 'range':
      if (typeof value !== 'number' || Number.isNaN(value)) return 'not a number'
      if (field.min !== undefined && value < field.min) return `below min ${field.min}`
      if (field.max !== undefined && value > field.max) return `above max ${field.max}`
      return null
    case 'select':
      return (field.options ?? []).some((o) => o.value === value) ? null : `not one of the options: ${String(value)}`
    case 'checkbox':
      return typeof value === 'boolean' ? null : 'not a boolean'
    case 'color':
      return typeof value === 'string' && SAFE_COLOR.test(value) ? null : 'not a safe colour'
    case 'text':
    case 'textarea':
      return typeof value === 'string' ? null : 'not a string'
    default:
      return null
  }
}

describe('effect packs', () => {
  it('ships five fx- section presets with unique slugs and known categories', () => {
    expect(PACKS.map((p) => p.slug)).toEqual(['fx-aurora-hero', 'fx-grain-editorial', 'fx-glass-cards', 'fx-neon-grid', 'fx-spotlight-features'])
    const slugs = TEMPLATE_PRESETS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const categories = new Set(TEMPLATE_CATEGORY_OPTIONS.map((c) => c.value))
    for (const preset of PACKS) {
      expect(preset.kind).toBe('section')
      expect(categories.has(preset.category)).toBe(true)
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('every fx- preset builds and draws a thumbnail', () => {
    for (const preset of PACKS) {
      const blocks = preset.blocks()
      expect(blocks.length).toBeGreaterThan(0)
      expect(() => renderTemplateThumbnailSvg(blocks)).not.toThrow()
      expect(blocks).toEqual(preset.blocks())
    }
  })

  it('uses only element types that exist in the registry', () => {
    const types = new Set(ELEMENTS.map((e) => e.type))
    for (const preset of PACKS) {
      for (const node of elementsOf(preset.blocks())) {
        expect(types.has(String(node.elementType)), `${preset.slug}: ${String(node.elementType)}`).toBe(true)
      }
    }
  })

  it('element props match the registry fields and their validation', () => {
    for (const preset of PACKS) {
      for (const node of elementsOf(preset.blocks())) {
        const type = String(node.elementType)
        const def = getElementDef(type)
        expect(def, `${preset.slug}: ${type}`).toBeDefined()
        const props = node.props as Record<string, unknown>
        const fields = new Map((def?.fields ?? []).map((f) => [f.name, f]))
        for (const [key, value] of Object.entries(props)) {
          const field = fields.get(key)
          expect(field, `${preset.slug}: ${type}.${key} is not a field`).toBeDefined()
          if (field) expect(fieldProblem(field, value), `${preset.slug}: ${type}.${key}`).toBeNull()
        }
      }
    }
  })

  it('renders every element in the packs', () => {
    for (const preset of PACKS) {
      for (const node of elementsOf(preset.blocks())) {
        const html = renderToStaticMarkup(React.createElement(React.Fragment, null, renderElement(String(node.elementType), node.props as Record<string, unknown>)))
        expect(html.length, `${preset.slug}: ${String(node.elementType)}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every design unchanged through asBlockStyle, so no effect key is dropped', () => {
    for (const preset of PACKS) {
      const designs = designsOf(preset.blocks())
      expect(designs.length).toBeGreaterThan(0)
      for (const design of designs) {
        expect(asBlockStyle(design), preset.slug).toEqual(design)
      }
    }
  })

  it('carries the effect keys each pack is meant to show', () => {
    const expected: Record<string, BlockStyle[]> = {
      'fx-aurora-hero': [{ bgEffect: 'aurora', overlayType: 'none', dividerBottom: 'wave', dividerBottomAnim: 'drift' }, { reveal: 'fade-up' }],
      'fx-grain-editorial': [{ bgEffect: 'grain' }, { reveal: 'fade-up' }],
      'fx-glass-cards': [{ bgEffect: 'gradient-shift' }, { glass: true, hover: 'lift', reveal: 'fade-up' }],
      'fx-neon-grid': [{ bgEffect: 'grid', bgColor: '#05060f' }],
      'fx-spotlight-features': [{ pointerFx: 'spotlight', spotlightColor: 'rgba(99,102,241,0.35)' }, { pointerFx: 'tilt' }],
    }
    for (const preset of PACKS) {
      const designs = designsOf(preset.blocks())
      for (const want of expected[preset.slug] ?? []) {
        const hit = designs.some((d) => Object.entries(want).every(([k, v]) => (d as Record<string, unknown>)[k] === v))
        expect(hit, `${preset.slug} missing ${JSON.stringify(want)}`).toBe(true)
      }
    }
  })
})
