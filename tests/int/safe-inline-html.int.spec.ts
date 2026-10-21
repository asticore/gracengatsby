import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HeadingElement } from '@/components/blocks/elements/HeadingElement'
import { SafeInlineHtml } from '@/components/blocks/elements/SafeInlineHtml'

const r = (text: string) => renderToStaticMarkup(React.createElement(SafeInlineHtml, { text, as: 'h2' }))

describe('SafeInlineHtml', () => {
  it('renders legacy plain strings exactly as React text', () => {
    for (const t of ['Tom & Jerry', '1 < 2', 'a <b', '<script>alert(1)</script>', 'x <3 y']) {
      expect(r(t)).toBe(renderToStaticMarkup(React.createElement('h2', null, t)))
    }
  })
  it('renders the sanitised subset', () => {
    expect(r('a <strong>b</strong> <em>c</em>')).toBe('<h2>a <strong>b</strong> <em>c</em></h2>')
  })
  it('strips dangerous markup', () => {
    const out = r('<strong onclick="x()">hi</strong><script>alert(1)</script><a href="javascript:alert(1)">l</a>')
    expect(out).not.toMatch(/script|onclick|javascript:/i)
  })
  it('round-trips escaped ampersands from the editor', () => {
    expect(r('Tom &amp; Jerry')).toBe('<h2>Tom &amp; Jerry</h2>')
  })
  it('heading uses it', () => {
    expect(renderToStaticMarkup(React.createElement(HeadingElement, { text: 'Hi <em>there</em>' }))).toContain('<em>there</em>')
  })
})
