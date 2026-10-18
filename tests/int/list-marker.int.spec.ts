import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { ELEMENTS } from '@/lib/elements/registry'
import { WAVE26_ELEMENTS } from '@/lib/elements/wave26Defs'
import { libraryCards } from '@/views/visualEditor/blockSchemas'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const items = [{ text: 'One' }, { text: 'Two' }]
const listHtml = (props: Record<string, unknown>) => render(renderElement('list', { items, ...props }))

describe('list markers', () => {
  it('bullets and none use a ul, numbers an ol', () => {
    expect(listHtml({ marker: 'bullets', align: 'left' })).toBe('<ul class="el-list el-list--bullets el-align--left"><li>One</li><li>Two</li></ul>')
    expect(listHtml({ marker: 'numbers', align: 'left' })).toBe('<ol class="el-list el-list--numbers el-align--left"><li>One</li><li>Two</li></ol>')
    expect(listHtml({ marker: 'none', align: 'left' })).toBe('<ul class="el-list el-list--none el-align--left"><li>One</li><li>Two</li></ul>')
  })

  it('icon marker draws one decorative svg per item, with a real ul and no role override', () => {
    const html = listHtml({ marker: 'icon', icon: 'star', align: 'center' })
    expect(html).toContain('<ul class="el-list el-list--marked el-list--icon el-align--center" role="list"')
    expect(html.match(/<svg/g)?.length).toBe(2)
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2)
    expect(html).toContain('M12 3l2.7 5.6')
  })

  it('unknown icon falls back to the check glyph', () => {
    expect(listHtml({ marker: 'icon', icon: 'nope' })).toContain('M4 12.5l5 5L20 6.5')
  })

  it('check, arrow and dash are CSS markers: no svg in the markup', () => {
    for (const marker of ['check', 'arrow', 'dash']) {
      const html = listHtml({ marker })
      expect(html, marker).toContain(`<ul class="el-list el-list--marked el-list--${marker} el-align--left" role="list">`)
      expect(html, marker).not.toContain('<svg')
      expect(html, marker).toContain('<li>One</li>')
    }
  })

  it('rows with a safe link render an anchor; unsafe links are dropped', () => {
    const html = render(renderElement('list', { marker: 'check', items: [{ text: 'Safe', href: 'https://example.com/' }, { text: 'Bad', href: 'javascript:alert(1)' }] }))
    expect(html).toContain('<a href="https://example.com/">Safe</a>')
    expect(html).toContain('<li>Bad</li>')
    expect(html).not.toMatch(/javascript|<a href="javascript/i)
    expect(render(renderElement('list', { items: [{ text: 'x', href: 'data:text/html,<script>' }] }))).not.toMatch(/data:|<a /)
  })

  it('gap, size and colour become CSS variables only when set, and are clamped or refused', () => {
    expect(listHtml({ marker: 'check' })).not.toContain('style=')
    expect(listHtml({ marker: 'check', gap: 12 })).toContain('style="--el-list-gap:12px"')
    expect(listHtml({ marker: 'check', gap: 99 })).toContain('--el-list-gap:32px')
    expect(listHtml({ marker: 'arrow', size: 40, iconColour: '#c0392b' })).toContain('--el-list-size:28px;--el-list-colour:#c0392b')
    const hostile = listHtml({ marker: 'check', iconColour: 'red;background:url(https://evil.test/x)' })
    expect(hostile).not.toContain('--el-list-colour')
    expect(hostile).not.toContain('evil')
  })
})

describe('list kind back-compat', () => {
  it('saved pages with kind and no marker render exactly as before', () => {
    expect(listHtml({ kind: 'bullets', align: 'left' })).toBe('<ul class="el-list el-list--bullets el-align--left"><li>One</li><li>Two</li></ul>')
    expect(listHtml({ kind: 'numbers', align: 'center' })).toBe('<ol class="el-list el-list--numbers el-align--center"><li>One</li><li>Two</li></ol>')
    expect(listHtml({ kind: 'none', align: 'left' })).toBe('<ul class="el-list el-list--none el-align--left"><li>One</li><li>Two</li></ul>')
  })

  it('a missing kind and marker is bullets, and repeater rows without href are unchanged', () => {
    expect(render(renderElement('list', {}))).toBe(render(renderElement('list', { marker: 'bullets' })))
    expect(listHtml({ kind: 'numbers' })).toBe(listHtml({ marker: 'numbers' }))
  })

  it('marker wins over kind; a plain-text line list still works', () => {
    expect(listHtml({ kind: 'numbers', marker: 'check' })).toContain('<ul class="el-list el-list--marked el-list--check')
    expect(render(renderElement('list', { items: 'Alpha\nBeta' }))).toBe('<ul class="el-list el-list--bullets el-align--left"><li>Alpha</li><li>Beta</li></ul>')
  })

  it('new defaults declare marker, not kind, and only use declared fields', () => {
    const def = WAVE26_ELEMENTS.find((e) => e.type === 'list')!
    const props = def.defaultProps()
    expect(props.marker).toBe('bullets')
    expect(props).not.toHaveProperty('kind')
    expect(def.fields.find((f) => f.name === 'marker')!.options!.map((o) => o.value)).toEqual(['bullets', 'numbers', 'none', 'icon', 'check', 'arrow', 'dash'])
  })
})

describe('icon-list is hidden from the library but still renders', () => {
  it('is flagged hidden in the registry', () => {
    const def = ELEMENTS.find((e) => e.type === 'icon-list')
    expect(def?.hidden).toBe(true)
    expect(ELEMENTS.find((e) => e.type === 'list')?.hidden).toBeFalsy()
  })

  it('is not offered in the library, while list is', () => {
    const slugs = libraryCards().map((c) => c.slug)
    expect(slugs).not.toContain('element:icon-list')
    expect(slugs).toContain('element:list')
  })

  it('still has a renderer that prints saved icon-list pages', () => {
    expect(ELEMENT_COMPONENTS['icon-list']).toBeDefined()
    const html = render(renderElement('icon-list', { items: 'Free delivery | /shipping', icon: 'truck', layout: 'stacked', align: 'left' }))
    expect(html).toContain('<ul class="el-icon-list el-icon-list--stacked el-align--left">')
    expect(html).toContain('<a href="/shipping">Free delivery</a>')
  })
})
