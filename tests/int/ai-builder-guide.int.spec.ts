// @vitest-environment node
// The Build with AI guide: it must name every element the builder may use, stay
// under its size cap, and be plain ASCII. The guide is pure; nothing is fetched.
import { describe, expect, it } from 'vitest'

import { BUILDER_DESIGN_SPECS } from '@/features/ai/builderDesign'
import { buildGuide, builderElements, elementCatalogue, GUIDE_MAX_CHARS, workedExample } from '@/features/ai/builderGuide'
import { FORM_ONLY_ELEMENT_TYPES } from '@/features/forms/elementDefs'
import { ELEMENTS } from '@/lib/elements/registry'

const guide = buildGuide({ mode: 'section', siteName: 'Candle Co' })

describe('builder guide', () => {
  it('names every element type the builder may use', () => {
    const types = builderElements().map((def) => def.type)
    expect(types.length).toBeGreaterThan(20)
    for (const type of types) {
      expect(guide).toContain(`${type}|`)
    }
  })

  it('leaves out hidden and form-only elements', () => {
    const hidden = ELEMENTS.filter((def) => def.hidden).map((def) => def.type)
    for (const type of [...hidden, ...FORM_ONLY_ELEMENT_TYPES]) {
      expect(builderElements().map((def) => def.type)).not.toContain(type)
    }
  })

  it('stays under the size cap before examples are added', () => {
    expect(guide.length).toBeLessThan(GUIDE_MAX_CHARS)
  })

  it('is plain ASCII and carries no literal backslash-u sequences', () => {
    expect(/^[\x00-\x7f]*$/.test(guide)).toBe(true)
    expect(guide.indexOf(String.fromCharCode(92))).toBe(-1)
  })

  it('describes the engage-template format and the section shape', () => {
    expect(guide).toContain('"format":"engage-template"')
    expect(guide).toContain('"schemaVersion":1')
    expect(guide).toContain('"blockType":"element"')
    expect(guide).toContain('"elementType"')
    expect(guide).toContain('ONLY one JSON object')
  })

  it('lists every design key the builder may write', () => {
    for (const spec of BUILDER_DESIGN_SPECS) {
      expect(guide).toContain(`${spec.key}:`)
    }
    expect(guide).not.toContain('customCss')
    expect(guide).not.toContain('bgImage')
  })

  it('lists every section display mode', () => {
    for (const mode of ['tabs', 'accordion', 'carousel', 'grid', 'modal', 'stack', 'hscroll', 'sticky-steps']) {
      expect(guide).toContain(mode)
    }
  })

  it('states the portal and media rules', () => {
    expect(guide).toContain('/shop')
    expect(guide).toContain('Never invent')
    expect(guide).toContain('never set picture')
  })

  it('is deterministic for the same context', () => {
    expect(buildGuide({ mode: 'page' })).toBe(buildGuide({ mode: 'page' }))
  })

  it('gives the page mode its own scope line', () => {
    expect(buildGuide({ mode: 'page' })).toContain('3 to 8 sections')
    expect(buildGuide({ mode: 'edit' })).toContain('edit one existing section')
  })

  it('catalogue lines carry select options and number ranges', () => {
    const catalogue = elementCatalogue()
    expect(catalogue).toMatch(/^heading\|Heading\|text:text/m)
    expect(catalogue).toContain('tag:h1|h2|h3|h4|h5|h6')
  })

  it('worked example is a section tree with real element types', () => {
    const example = JSON.parse(workedExample()) as { tree: Array<{ columns: Array<{ blocks: Array<{ elementType: string }> }> }> }
    const types = example.tree[0].columns[0].blocks.map((block) => block.elementType)
    expect(types).toEqual(['heading', 'text-editor', 'button'])
  })
})
