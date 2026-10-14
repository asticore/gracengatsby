// Wave 11: design model v2 render path. renderElement emits scoped CSS for v2 designs only;
// v1 designs and calls without a design render exactly as before.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { asBlockStyle } from '@/lib/blockStyle'

const props = { text: 'Hello', tag: 'h2', align: 'left' }
const v2 = { schemaVersion: 2, color: { text: { desktop: { normal: '#123456', hover: '#654321' } } } }
const render = (node: React.ReactNode): string => renderToStaticMarkup(React.createElement(React.Fragment, null, node))

describe('renderElement: v2 designs', () => {
  it('wraps the element with data-eid and a scoped style tag', () => {
    const html = render(renderElement('heading', props, v2, 'el-3'))
    expect(html).toContain('<style>[data-eid="el-3"]{color:#123456}[data-eid="el-3"]:hover{color:#654321}</style>')
    expect(html).toContain('<div data-eid="el-3">')
    expect(html).toContain('Hello')
  })

  it('emits the style tag once, before the element', () => {
    const html = render(renderElement('heading', props, v2, 'el-3'))
    expect((html.match(/<style>/g) ?? []).length).toBe(1)
    expect(html.indexOf('<style>')).toBeLessThan(html.indexOf('<div data-eid'))
  })

  it('an unsafe scope id renders the element with no style and no wrapper', () => {
    const html = render(renderElement('heading', props, v2, 'x"]{}'))
    expect(html).not.toContain('<style>')
    expect(html).not.toContain('data-eid')
    expect(html).toContain('Hello')
  })

  it('an unknown schema version renders the element unchanged', () => {
    const html = render(renderElement('heading', props, { schemaVersion: 9, color: { text: { desktop: { normal: '#000' } } } }, 'el-3'))
    expect(html).not.toContain('<style>')
    expect(html).toContain('Hello')
  })

  it('custom CSS with a closing style tag cannot break out of the style element', () => {
    const html = render(renderElement('heading', props, { schemaVersion: 2, customCss: 'p{color:red}</style><script>alert(1)</script>' }, 'el-3'))
    expect((html.match(/<\/style>/g) ?? []).length).toBe(1)
    expect(html).not.toContain('<script')
  })

  it('a v2 design that sets nothing renders without a wrapper', () => {
    const html = render(renderElement('heading', props, { schemaVersion: 2 }, 'el-3'))
    expect(html).not.toContain('data-eid')
    expect(html).toContain('Hello')
  })
})

describe('renderElement: everything else is unchanged', () => {
  it('a v1 design passed in is not wrapped here (the v1 wrapper handles it)', () => {
    const v1 = { paddingTop: 10, textColor: '#000' }
    expect(render(renderElement('heading', props, v1, 'el-3'))).toBe(render(renderElement('heading', props)))
    expect(render(renderElement('heading', props, v1, 'el-3'))).not.toContain('data-eid')
  })

  it('a call with no design renders the element as before', () => {
    const html = render(renderElement('heading', props))
    expect(html).toContain('<h2 style="text-align:left;margin:0">Hello</h2>')
    expect(html).not.toContain('data-eid')
  })

  it('an unknown element type still renders nothing, with or without a design', () => {
    expect(renderElement('nope', {}, v2, 'el-3')).toBeNull()
    expect(renderElement('nope', {})).toBeNull()
  })

  it('asBlockStyle ignores v2 designs, so the v1 wrapper does not also apply them', () => {
    expect(asBlockStyle(v2)).toEqual({})
    expect(asBlockStyle({ paddingTop: 4 })).toEqual({ paddingTop: 4 })
  })
})
